import { formatTime, MINUTES_PER_DAY, parseTime } from "./time";
import type {
  BufferViolation,
  NormalizedMovie,
  SchedulerInput,
  ScheduleEntry,
  ValidationIssue,
} from "./types";

/** Upper bound on movies: the engine uses bitmask DP over 2^N subsets. */
export const MAX_MOVIES = 10;
export const MAX_DURATION_MINUTES = MINUTES_PER_DAY;
export const MAX_BUFFER_MINUTES = 12 * 60;

export interface ValidationResult {
  issues: ValidationIssue[];
  /** True when there are no "error" issues and the engine can run. */
  ok: boolean;
  movies: NormalizedMovie[];
}

/**
 * Validate and normalise user input. Showtimes are parsed to minutes,
 * de-duplicated and sorted. Never throws; problems are reported as issues.
 */
export function validateInput(input: SchedulerInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const movies: NormalizedMovie[] = [];
  const allowPastMidnight = input.allowPastMidnight ?? true;
  const buffer = input.bufferMinutes;

  if (!Number.isFinite(buffer) || !Number.isInteger(buffer) || buffer < 0) {
    issues.push({ level: "error", field: "buffer", message: "Buffer must be a whole number of minutes, 0 or more." });
  } else if (buffer > MAX_BUFFER_MINUTES) {
    issues.push({ level: "error", field: "buffer", message: `Buffer cannot exceed ${MAX_BUFFER_MINUTES / 60} hours.` });
  }

  if (input.movies.length === 0) {
    issues.push({ level: "error", field: "movies", message: "Add at least one movie." });
  } else if (input.movies.length === 1) {
    issues.push({
      level: "info",
      field: "movies",
      message: "Add at least two movies to plan a marathon. With one movie, every showtime works.",
    });
  } else if (input.movies.length > MAX_MOVIES) {
    issues.push({ level: "error", field: "movies", message: `At most ${MAX_MOVIES} movies are supported.` });
  }

  const seenNames = new Map<string, string>();

  input.movies.forEach((movie, i) => {
    const label = movie.name.trim() || `Movie ${i + 1}`;
    const err = (field: ValidationIssue["field"], message: string) =>
      issues.push({ level: "error", movieId: movie.id, field, message });
    const warn = (field: ValidationIssue["field"], message: string) =>
      issues.push({ level: "warning", movieId: movie.id, field, message });

    const name = movie.name.trim();
    if (!name) {
      err("name", `${label}: name cannot be empty.`);
    } else {
      const key = name.toLowerCase();
      if (seenNames.has(key)) warn("name", `"${name}" is listed more than once. Use unique names to tell them apart.`);
      else seenNames.set(key, movie.id);
    }

    const duration = movie.durationMinutes;
    if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration <= 0) {
      err("duration", `${label}: duration must be greater than zero.`);
    } else if (duration > MAX_DURATION_MINUTES) {
      err("duration", `${label}: duration cannot exceed 24 hours.`);
    }

    const parsed: number[] = [];
    const invalid: string[] = [];
    for (const raw of movie.showtimes) {
      const t = parseTime(raw);
      if (t === null) invalid.push(raw);
      else parsed.push(t);
    }
    if (invalid.length > 0) {
      err("showtimes", `${label}: invalid showtime${invalid.length > 1 ? "s" : ""} ${invalid.map((s) => `"${s}"`).join(", ")}.`);
    }

    let showtimes = [...new Set(parsed)].sort((a, b) => a - b);
    if (showtimes.length < parsed.length) {
      warn("showtimes", `${label}: duplicate showtimes were ignored.`);
    }

    if (Number.isInteger(duration) && duration > 0) {
      const lateOnes = showtimes.filter((t) => t + duration > MINUTES_PER_DAY);
      if (lateOnes.length > 0) {
        const list = lateOnes.map((t) => formatTime(t)).join(", ");
        if (allowPastMidnight) {
          warn("showtimes", `${label}: the ${list} show${lateOnes.length > 1 ? "s" : ""} end${lateOnes.length > 1 ? "" : "s"} after midnight.`);
        } else {
          showtimes = showtimes.filter((t) => t + duration <= MINUTES_PER_DAY);
          warn("showtimes", `${label}: ${list} ignored because ${lateOnes.length > 1 ? "they end" : "it ends"} after midnight.`);
        }
      }
    }

    if (movie.showtimes.length === 0) {
      err("showtimes", `${label}: add at least one showtime.`);
    } else if (showtimes.length === 0 && invalid.length === 0) {
      err("showtimes", `${label}: no usable showtimes on this day.`);
    }

    movies.push({ id: movie.id, name: name || label, durationMinutes: duration, showtimes });
  });

  return { issues, ok: !issues.some((i) => i.level === "error"), movies };
}

/**
 * Check the buffer rule between consecutive entries:
 *   next.start >= previous.end + buffer
 * Returns one violation per offending pair (empty array = valid).
 */
export function validateSchedule(
  entries: Pick<ScheduleEntry, "movieId" | "movieName" | "start" | "end">[],
  bufferMinutes: number,
): BufferViolation[] {
  const violations: BufferViolation[] = [];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const next = entries[i];
    const requiredStart = prev.end + bufferMinutes;
    if (next.start < requiredStart) {
      violations.push({
        fromMovieId: prev.movieId,
        fromMovieName: prev.movieName,
        toMovieId: next.movieId,
        toMovieName: next.movieName,
        previousEnd: prev.end,
        requiredStart,
        actualStart: next.start,
        violationMinutes: requiredStart - next.start,
        overlaps: next.start < prev.end,
      });
    }
  }
  return violations;
}
