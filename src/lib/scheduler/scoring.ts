import { MINUTES_PER_DAY } from "./time";
import type { NormalizedMovie, Schedule, ScheduleEntry, SortKey } from "./types";
import { validateSchedule } from "./validation";

export interface Placement {
  movie: NormalizedMovie;
  start: number;
}

/** Build a schedule (with all metrics) from movies placed at chosen showtimes, in viewing order. */
export function buildSchedule(placements: Placement[], bufferMinutes: number): Schedule {
  const entries: ScheduleEntry[] = placements.map(({ movie, start }, i) => {
    const prevEnd = i > 0 ? placements[i - 1].start + placements[i - 1].movie.durationMinutes : null;
    const gapBefore = prevEnd === null ? null : start - prevEnd;
    return {
      movieId: movie.id,
      movieName: movie.name,
      start,
      end: start + movie.durationMinutes,
      durationMinutes: movie.durationMinutes,
      gapBefore,
      extraWaitBefore: gapBefore === null ? null : gapBefore - bufferMinutes,
    };
  });

  const startTime = entries.length ? entries[0].start : 0;
  const endTime = entries.length ? entries[entries.length - 1].end : 0;
  const totalMovieMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const totalElapsedMinutes = endTime - startTime;
  const totalWaitingMinutes = totalElapsedMinutes - totalMovieMinutes;
  const totalBufferMinutes = Math.max(0, entries.length - 1) * bufferMinutes;

  return {
    id: scheduleId(entries),
    entries,
    startTime,
    endTime,
    totalElapsedMinutes,
    totalMovieMinutes,
    totalWaitingMinutes,
    totalBufferMinutes,
    extraWaitingMinutes: totalWaitingMinutes - totalBufferMinutes,
    endsAfterMidnight: endTime > MINUTES_PER_DAY,
    valid: validateSchedule(entries, bufferMinutes).length === 0,
  };
}

export function scheduleId(entries: Pick<ScheduleEntry, "movieId" | "start">[]): string {
  return entries.map((e) => `${e.movieId}@${e.start}`).join("|");
}

const cmp = (a: number, b: number) => a - b;

/**
 * The optimisation objective. Primary: finish as early as possible.
 * Tie-break: least waiting. (For complete schedules total movie time is constant,
 * so with an equal finish, least waiting ⇔ shortest elapsed time ⇔ latest start ⇔
 * least extra waiting beyond the buffer — they all agree.)
 * Remaining ties: earliest showtimes first (compared movie by movie), then the id,
 * so the ordering is fully deterministic.
 */
export function compareByFinish(a: Schedule, b: Schedule): number {
  return (
    cmp(a.endTime, b.endTime) ||
    cmp(a.totalWaitingMinutes, b.totalWaitingMinutes) ||
    compareStartSequences(a.entries, b.entries) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Lexicographic comparison of start times, entry by entry. */
export function compareStartSequences(a: readonly { start: number }[], b: readonly { start: number }[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].start !== b[i].start) return a[i].start - b[i].start;
  }
  return a.length - b.length;
}

export const comparators: Record<SortKey, (a: Schedule, b: Schedule) => number> = {
  finish: compareByFinish,
  start: (a, b) => cmp(a.startTime, b.startTime) || compareByFinish(a, b),
  waiting: (a, b) => cmp(a.totalWaitingMinutes, b.totalWaitingMinutes) || compareByFinish(a, b),
  elapsed: (a, b) => cmp(a.totalElapsedMinutes, b.totalElapsedMinutes) || compareByFinish(a, b),
};

export const sortLabels: Record<SortKey, string> = {
  finish: "Earliest finish",
  start: "Earliest start",
  waiting: "Lowest waiting time",
  elapsed: "Shortest total time",
};

export function sortSchedules(schedules: Schedule[], key: SortKey): Schedule[] {
  return [...schedules].sort(comparators[key]);
}
