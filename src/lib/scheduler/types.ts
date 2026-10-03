/**
 * Core types for the movie marathon scheduling engine.
 *
 * All times inside the engine are integers: minutes after midnight of the
 * selected day. A value >= 1440 means "after midnight" (the next calendar day).
 * Strings only exist at the edges (user input and display formatting).
 */

/** A movie as entered by the user. */
export interface Movie {
  id: string;
  name: string;
  durationMinutes: number;
  /** Showtimes on the selected day, as "HH:MM" (24h) strings. */
  showtimes: string[];
}

export interface SchedulerInput {
  movies: Movie[];
  /** Minimum gap required between one movie ending and the next starting. */
  bufferMinutes: number;
  /**
   * When false, showtimes whose movie would end after midnight are discarded.
   * When true (default), they are allowed and flagged in the result.
   */
  allowPastMidnight?: boolean;
}

/** A validated movie with showtimes parsed, de-duplicated and sorted ascending. */
export interface NormalizedMovie {
  id: string;
  name: string;
  durationMinutes: number;
  showtimes: number[];
}

export type IssueLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: IssueLevel;
  /** Present when the issue belongs to a specific movie. */
  movieId?: string;
  field: "name" | "duration" | "showtimes" | "buffer" | "movies";
  message: string;
}

export interface ScheduleEntry {
  movieId: string;
  movieName: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  durationMinutes: number;
  /** Minutes between the previous movie's end and this start; null for the first movie. */
  gapBefore: number | null;
  /** gapBefore minus the required buffer; null for the first movie. Negative = violation. */
  extraWaitBefore: number | null;
}

export interface Schedule {
  /** Stable identity: "movieId@start|movieId@start|..." */
  id: string;
  entries: ScheduleEntry[];
  startTime: number;
  endTime: number;
  /** endTime - startTime: the whole day commitment. */
  totalElapsedMinutes: number;
  /** Sum of all movie durations. */
  totalMovieMinutes: number;
  /** Total time between movies (required buffer + extra waiting). */
  totalWaitingMinutes: number;
  /** (number of movies - 1) × buffer */
  totalBufferMinutes: number;
  /** Waiting beyond the required buffer. */
  extraWaitingMinutes: number;
  endsAfterMidnight: boolean;
  /** True when every consecutive pair satisfies next.start >= prev.end + buffer. */
  valid: boolean;
}

export interface BufferViolation {
  fromMovieId: string;
  fromMovieName: string;
  toMovieId: string;
  toMovieName: string;
  previousEnd: number;
  requiredStart: number;
  actualStart: number;
  /** requiredStart - actualStart (> 0). */
  violationMinutes: number;
  /** True when the next movie starts before the previous one has even ended. */
  overlaps: boolean;
}

/** Why a particular movie order cannot be scheduled at all. */
export interface OrderFailure {
  /** Position (0-based) in the order of the movie that cannot be placed. */
  index: number;
  previousMovieId: string;
  previousMovieName: string;
  /** End of the previous movie using the earliest possible showtimes for the prefix. */
  previousEnd: number;
  requiredStart: number;
  movieId: string;
  movieName: string;
  /** The latest showtime of the failing movie — the closest miss. */
  latestShowtime: number;
  /** requiredStart - latestShowtime */
  shortByMinutes: number;
  /** "buffer": starts after the previous movie ends but inside the buffer. "overlap": starts before it ends. */
  kind: "buffer" | "overlap";
  /** The prefix that could be scheduled (earliest showtimes). */
  partial: ScheduleEntry[];
  message: string;
}

export interface OrderAnalysis {
  order: string[];
  names: string[];
  feasible: boolean;
  /** Best schedule for this order (earliest finish, then least waiting). */
  best: Schedule | null;
  /** Number of valid showtime combinations for this order. */
  combinations: number;
  failure: OrderFailure | null;
}

/** Can movie `from` be followed (at some point) by movie `to`? */
export interface PairAnalysis {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  feasible: boolean;
  /** Earliest possible end of `from`. */
  earliestEnd: number;
  /** earliestEnd + buffer */
  requiredStart: number;
  /** Latest showtime of `to`. */
  latestShowtime: number;
}

/** A schedule with no overlapping movies that nevertheless breaks the buffer rule. */
export interface NearMiss {
  schedule: Schedule;
  violations: BufferViolation[];
}

export type SortKey = "finish" | "start" | "waiting" | "elapsed";

export interface SolveOptions {
  /** Maximum number of feasible schedules to materialise (top-K by earliest finish). Default 500. */
  maxSchedules?: number;
  /** Analyse every movie order (N! permutations). Default true. */
  analyzeOrders?: boolean;
  /** Only analyse orders when movie count is at most this. Default 8. */
  maxOrderMovies?: number;
  /** Search for buffer-violating "near miss" schedules. Default true. */
  nearMisses?: boolean;
  /** Maximum number of near misses to return. Default 20. */
  maxNearMisses?: number;
}

export interface SolveStats {
  /** Search-tree nodes visited while enumerating feasible schedules. */
  nodesExplored: number;
  /** Memoised dynamic-programming states created. */
  dpStates: number;
  /** Movie orders analysed (0 if skipped). */
  ordersEvaluated: number;
  /** N! × Π(showtimes) — what naive brute force would have to check. */
  bruteForceCombinations: number;
}

export interface SolveResult {
  /** "invalid" when the input has errors; nothing else is computed then. */
  status: "ok" | "invalid";
  issues: ValidationIssue[];
  movies: NormalizedMovie[];
  bufferMinutes: number;
  /** True when all requested movies fit in one schedule. */
  allFeasible: boolean;
  /** The best complete schedule: earliest finish, then least waiting. */
  optimal: Schedule | null;
  /** Exact number of feasible complete schedules (all orders × showtime choices). */
  feasibleCount: number;
  /** Top feasible schedules ordered by earliest finish (at most maxSchedules). */
  schedules: Schedule[];
  /** True when feasibleCount > schedules.length. */
  truncated: boolean;
  /** One entry per movie order, or null if skipped (too many movies). */
  orders: OrderAnalysis[] | null;
  pairs: PairAnalysis[];
  nearMisses: NearMiss[];
  /** Largest number of movies that can be watched. */
  maxWatchable: number;
  /** When not all movies fit: the best schedule for the largest watchable subset. */
  bestPartial: Schedule | null;
  stats: SolveStats;
}
