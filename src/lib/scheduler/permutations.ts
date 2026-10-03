import { buildSchedule, type Placement } from "./scoring";
import { formatTime, lowerBound, upperIndex } from "./time";
import type { NormalizedMovie, OrderAnalysis, OrderFailure, PairAnalysis } from "./types";

/** All permutations of `items`, in lexicographic order of their indices. */
export function* permutations<T>(items: readonly T[]): Generator<T[]> {
  const idx = items.map((_, i) => i);
  const n = idx.length;
  while (true) {
    yield idx.map((i) => items[i]);
    // Next lexicographic permutation (Narayana Pandita).
    let i = n - 2;
    while (i >= 0 && idx[i] >= idx[i + 1]) i--;
    if (i < 0) return;
    let j = n - 1;
    while (idx[j] <= idx[i]) j--;
    [idx[i], idx[j]] = [idx[j], idx[i]];
    for (let l = i + 1, r = n - 1; l < r; l++, r--) [idx[l], idx[r]] = [idx[r], idx[l]];
  }
}

export function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/**
 * Analyse one fixed viewing order.
 *
 * Feasibility: greedily take the earliest showtime that respects the buffer.
 * Taking the earliest possible end at every step can never hurt later movies,
 * so if greedy fails, NO showtime assignment exists for this order, and the
 * point of failure is the genuine bottleneck.
 *
 * Best schedule (same objective as the global ranking):
 *  1. Greedy forward gives the earliest finish T for this order.
 *  2. A backward pass takes the latest showtime of each movie that still finishes
 *     by T; its first start S is the latest possible start (= least waiting).
 *  3. Greedy forward again, with the first movie fixed at S, gives the earliest
 *     showtimes among schedules spanning exactly S → T (the final tie-break).
 */
export function analyzeOrder(order: readonly NormalizedMovie[], bufferMinutes: number): OrderAnalysis {
  const base = { order: order.map((m) => m.id), names: order.map((m) => m.name) };

  const forward = greedyForward(order, bufferMinutes, -Infinity);
  if (forward.length < order.length) {
    return {
      ...base,
      feasible: false,
      best: null,
      combinations: 0,
      failure: describeFailure(order, forward, forward.length, bufferMinutes),
    };
  }
  const last = forward[forward.length - 1];

  // Backward pass: latest start S among schedules finishing by T.
  let deadline = last.start + last.movie.durationMinutes; // latest allowed end for movie k
  let latestFirstStart = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const movie = order[k];
    // Exists: the forward placement is a witness.
    latestFirstStart = movie.showtimes[upperIndex(movie.showtimes, deadline - movie.durationMinutes)];
    deadline = latestFirstStart - bufferMinutes;
  }

  return {
    ...base,
    feasible: true,
    best: buildSchedule(greedyForward(order, bufferMinutes, latestFirstStart), bufferMinutes),
    combinations: countOrderCombinations(order, bufferMinutes),
    failure: null,
  };
}

/** Earliest valid showtime for each movie in turn; stops early if a movie cannot be placed. */
function greedyForward(order: readonly NormalizedMovie[], bufferMinutes: number, firstNotBefore: number): Placement[] {
  const placed: Placement[] = [];
  let prevEnd = -Infinity;
  for (let k = 0; k < order.length; k++) {
    const movie = order[k];
    const required = k === 0 ? firstNotBefore : prevEnd + bufferMinutes;
    const i = lowerBound(movie.showtimes, required);
    if (i === movie.showtimes.length) break;
    placed.push({ movie, start: movie.showtimes[i] });
    prevEnd = movie.showtimes[i] + movie.durationMinutes;
  }
  return placed;
}

function describeFailure(
  order: readonly NormalizedMovie[],
  placed: Placement[],
  index: number,
  bufferMinutes: number,
): OrderFailure {
  const prev = placed[index - 1];
  const movie = order[index];
  const previousEnd = prev.start + prev.movie.durationMinutes;
  const requiredStart = previousEnd + bufferMinutes;
  const latestShowtime = movie.showtimes[movie.showtimes.length - 1];
  const kind = latestShowtime >= previousEnd ? "buffer" : "overlap";
  const shortBy = requiredStart - latestShowtime;

  const lead =
    `${prev.movie.name} ends at ${formatTime(previousEnd)} at the earliest` +
    (bufferMinutes > 0 ? `, so with a ${bufferMinutes}-minute buffer ${movie.name} must start at or after ${formatTime(requiredStart)}.` : `, so ${movie.name} must start at or after ${formatTime(requiredStart)}.`);
  const tail =
    kind === "buffer"
      ? ` Its latest showtime is ${formatTime(latestShowtime)} — only ${latestShowtime - previousEnd} min after ${prev.movie.name} ends, ${shortBy} min short of the buffer.`
      : ` Its latest showtime is ${formatTime(latestShowtime)}, which starts before ${prev.movie.name} even ends.`;

  return {
    index,
    previousMovieId: prev.movie.id,
    previousMovieName: prev.movie.name,
    previousEnd,
    requiredStart,
    movieId: movie.id,
    movieName: movie.name,
    latestShowtime,
    shortByMinutes: shortBy,
    kind,
    partial: buildSchedule(placed, bufferMinutes).entries,
    message: lead + tail,
  };
}

/**
 * Count valid showtime assignments for a fixed order in O(N·S) using prefix sums:
 * ways(k, s) = Σ ways(k-1, s') over showtimes s' of the previous movie with
 * s' + duration + buffer <= s. Because showtimes are sorted, those s' form a prefix.
 */
export function countOrderCombinations(order: readonly NormalizedMovie[], bufferMinutes: number): number {
  if (order.length === 0) return 0;
  let ways = order[0].showtimes.map(() => 1);
  for (let k = 1; k < order.length; k++) {
    const prev = order[k - 1];
    const cur = order[k];
    const next: number[] = [];
    let p = 0;
    let prefix = 0;
    for (const s of cur.showtimes) {
      while (p < prev.showtimes.length && prev.showtimes[p] + prev.durationMinutes + bufferMinutes <= s) {
        prefix += ways[p++];
      }
      next.push(prefix);
    }
    ways = next;
  }
  return ways.reduce((a, b) => a + b, 0);
}

/**
 * For every ordered pair (A, B): can B be watched after A at all?
 * True iff A's earliest end + buffer <= B's latest showtime.
 * If neither A→B nor B→A works, the two movies can never share a day.
 */
export function analyzePairs(movies: readonly NormalizedMovie[], bufferMinutes: number): PairAnalysis[] {
  const pairs: PairAnalysis[] = [];
  for (const a of movies) {
    for (const b of movies) {
      if (a === b || a.showtimes.length === 0 || b.showtimes.length === 0) continue;
      const earliestEnd = a.showtimes[0] + a.durationMinutes;
      const requiredStart = earliestEnd + bufferMinutes;
      const latestShowtime = b.showtimes[b.showtimes.length - 1];
      pairs.push({
        fromId: a.id,
        fromName: a.name,
        toId: b.id,
        toName: b.name,
        feasible: latestShowtime >= requiredStart,
        earliestEnd,
        requiredStart,
        latestShowtime,
      });
    }
  }
  return pairs;
}
