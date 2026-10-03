import { analyzeOrder, analyzePairs, factorial, permutations } from "./permutations";
import { buildSchedule, compareByFinish, compareStartSequences, type Placement } from "./scoring";
import { lowerBound } from "./time";
import type {
  NearMiss,
  NormalizedMovie,
  OrderAnalysis,
  Schedule,
  SchedulerInput,
  SolveOptions,
  SolveResult,
} from "./types";
import { validateInput, validateSchedule } from "./validation";

/*
 * ─── How the engine works ────────────────────────────────────────────────────
 *
 * A schedule is an ORDER of the movies plus a SHOWTIME for each, such that for
 * every consecutive pair:   next.start >= previous.end + buffer.
 *
 * Key observation: once a set of movies has been watched, the only thing that
 * matters for the rest of the day is WHEN the last one ended. So the state of
 * the search is (set of movies still to watch, end time of the previous movie).
 *
 *   F(remaining, prevEnd) = earliest possible finish of the remaining movies
 *   C(remaining, prevEnd) = number of valid ways to watch the remaining movies
 *
 * Both are memoised over (bitmask, prevEnd). prevEnd only takes values that are
 * actual movie end times, so the state space is at most 2^N × (total showtimes).
 *
 * Feasible schedules are enumerated with depth-first search over (movie, showtime)
 * choices, pruned by F:
 *   • a branch is cut as soon as F says the remaining movies cannot fit, so the
 *     search never walks into dead ends;
 *   • once K schedules are collected, a branch is cut when even its best possible
 *     finish is later than the K-th best found so far (branch and bound).
 * This yields the exact top-K schedules by earliest finish without materialising
 * the N! × Π(showtimes) Cartesian product.
 */

const DEFAULTS: Required<SolveOptions> = {
  maxSchedules: 500,
  analyzeOrders: true,
  maxOrderMovies: 8,
  nearMisses: true,
  maxNearMisses: 20,
};

/** Hard cap on search nodes for the (optional, best-effort) near-miss search. */
const NEAR_MISS_NODE_BUDGET = 50_000;

/** Memo keys pack (mask, prevEnd) into one number; prevEnd < 2 days + buffer. */
const KEY_SHIFT = 8192;

export function solve(input: SchedulerInput, options: SolveOptions = {}): SolveResult {
  const opts = { ...DEFAULTS, ...options };
  const validation = validateInput(input);
  const buffer = input.bufferMinutes;
  const movies = validation.movies;

  const empty: SolveResult = {
    status: "invalid",
    issues: validation.issues,
    movies,
    bufferMinutes: buffer,
    allFeasible: false,
    optimal: null,
    feasibleCount: 0,
    schedules: [],
    truncated: false,
    orders: null,
    pairs: [],
    nearMisses: [],
    maxWatchable: 0,
    bestPartial: null,
    stats: { nodesExplored: 0, dpStates: 0, ordersEvaluated: 0, bruteForceCombinations: 0 },
  };
  if (!validation.ok) return empty;

  const search = new ScheduleSearch(movies, buffer);
  const n = movies.length;
  const full = (1 << n) - 1;

  // Earliest possible finish of the whole marathon (any order).
  const earliestFinish = search.rootFinish(full);
  const allFeasible = earliestFinish !== Infinity;

  const { schedules, nodesExplored } = allFeasible
    ? search.topK(full, opts.maxSchedules)
    : { schedules: [] as Schedule[], nodesExplored: 0 };
  const feasibleCount = allFeasible ? search.rootCount(full) : 0;

  let orders: OrderAnalysis[] | null = null;
  if (opts.analyzeOrders && n <= opts.maxOrderMovies) {
    orders = [];
    for (const order of permutations(movies)) orders.push(analyzeOrder(order, buffer));
    orders.sort(compareOrders);
  }

  const partial = allFeasible ? null : bestSubset(movies, buffer);

  const nearMisses =
    opts.nearMisses && buffer > 0 && n >= 2 ? findNearMisses(movies, buffer, opts.maxNearMisses) : [];

  return {
    status: "ok",
    issues: validation.issues,
    movies,
    bufferMinutes: buffer,
    allFeasible,
    optimal: schedules[0] ?? null,
    feasibleCount,
    schedules,
    truncated: feasibleCount > schedules.length,
    orders,
    pairs: analyzePairs(movies, buffer),
    nearMisses,
    maxWatchable: allFeasible ? n : (partial?.entries.length ?? 0),
    bestPartial: partial,
    stats: {
      nodesExplored,
      dpStates: search.dpStates,
      ordersEvaluated: orders?.length ?? 0,
      bruteForceCombinations: factorial(n) * movies.reduce((p, m) => p * m.showtimes.length, 1),
    },
  };
}

function compareOrders(a: OrderAnalysis, b: OrderAnalysis): number {
  if (a.best && b.best) return compareByFinish(a.best, b.best);
  if (a.best) return -1;
  if (b.best) return 1;
  // Infeasible orders: those that get further before failing first.
  return (b.failure?.index ?? 0) - (a.failure?.index ?? 0) || (a.failure?.shortByMinutes ?? 0) - (b.failure?.shortByMinutes ?? 0);
}

/** Memoised DP + branch-and-bound search over (remaining movies bitmask, previous end time). */
export class ScheduleSearch {
  private finishMemo = new Map<number, number>();
  private countMemo = new Map<number, number>();

  constructor(
    private readonly movies: readonly NormalizedMovie[],
    private readonly buffer: number,
  ) {}

  get dpStates(): number {
    return this.finishMemo.size + this.countMemo.size;
  }

  /** Earliest finish of all movies in `remaining`, given the previous movie ended at prevEnd. */
  finish(remaining: number, prevEnd: number): number {
    if (remaining === 0) return prevEnd;
    const key = remaining * KEY_SHIFT + prevEnd;
    const cached = this.finishMemo.get(key);
    if (cached !== undefined) return cached;

    let best = Infinity;
    const earliestStart = prevEnd + this.buffer;
    for (let j = 0; j < this.movies.length; j++) {
      if (!(remaining & (1 << j))) continue;
      const m = this.movies[j];
      // Earliest valid showtime is optimal: ending earlier never hurts later choices.
      const i = lowerBound(m.showtimes, earliestStart);
      if (i < m.showtimes.length) {
        best = Math.min(best, this.finish(remaining & ~(1 << j), m.showtimes[i] + m.durationMinutes));
      }
    }
    this.finishMemo.set(key, best);
    return best;
  }

  /** Earliest finish when nothing has been watched yet (first movie has no buffer constraint). */
  rootFinish(all: number): number {
    let best = Infinity;
    for (let j = 0; j < this.movies.length; j++) {
      if (!(all & (1 << j)) || this.movies[j].showtimes.length === 0) continue;
      const m = this.movies[j];
      best = Math.min(best, this.finish(all & ~(1 << j), m.showtimes[0] + m.durationMinutes));
    }
    return best;
  }

  /** Number of valid ways to watch all of `remaining` after prevEnd. */
  count(remaining: number, prevEnd: number): number {
    if (remaining === 0) return 1;
    const key = remaining * KEY_SHIFT + prevEnd;
    const cached = this.countMemo.get(key);
    if (cached !== undefined) return cached;

    let total = 0;
    for (let j = 0; j < this.movies.length; j++) {
      if (!(remaining & (1 << j))) continue;
      const m = this.movies[j];
      const rest = remaining & ~(1 << j);
      for (let i = lowerBound(m.showtimes, prevEnd + this.buffer); i < m.showtimes.length; i++) {
        const end = m.showtimes[i] + m.durationMinutes;
        // finish() is monotone in prevEnd: once infeasible, every later showtime is too.
        if (this.finish(rest, end) === Infinity) break;
        total += this.count(rest, end);
      }
    }
    this.countMemo.set(key, total);
    return total;
  }

  rootCount(all: number): number {
    let total = 0;
    for (let j = 0; j < this.movies.length; j++) {
      if (!(all & (1 << j))) continue;
      const m = this.movies[j];
      for (const s of m.showtimes) {
        const end = s + m.durationMinutes;
        if (this.finish(all & ~(1 << j), end) === Infinity) break;
        total += this.count(all & ~(1 << j), end);
      }
    }
    return total;
  }

  /**
   * Exact top-K feasible schedules by (finish, waiting, id) via DFS + branch and bound.
   * Every visited node is guaranteed to extend to at least one feasible schedule.
   */
  topK(all: number, k: number): { schedules: Schedule[]; nodesExplored: number } {
    const heap = new MaxHeap<Candidate>(compareCandidates);
    const movieMinutes = this.movies.reduce((s, m, j) => (all & (1 << j) ? s + m.durationMinutes : s), 0);
    const path: Placement[] = [];
    let nodes = 0;

    const visit = (remaining: number, prevEnd: number) => {
      const earliestStart = path.length === 0 ? -Infinity : prevEnd + this.buffer;

      // Collect children that can still complete the marathon, best bound first,
      // so good schedules are found early and the bound tightens quickly.
      const children: { j: number; start: number; end: number; bestFinish: number }[] = [];
      for (let j = 0; j < this.movies.length; j++) {
        if (!(remaining & (1 << j))) continue;
        const m = this.movies[j];
        const rest = remaining & ~(1 << j);
        for (let i = lowerBound(m.showtimes, earliestStart); i < m.showtimes.length; i++) {
          const start = m.showtimes[i];
          const end = start + m.durationMinutes;
          const bestFinish = this.finish(rest, end);
          // finish() is monotone in the showtime: once infeasible, later showtimes are too.
          if (bestFinish === Infinity) break;
          children.push({ j, start, end, bestFinish });
        }
      }
      children.sort((a, b) => a.bestFinish - b.bestFinish || b.start - a.start);

      for (const { j, start, end, bestFinish } of children) {
        if (heap.size >= k) {
          const worst = heap.peek()!;
          if (bestFinish > worst.end) break; // sorted: every remaining child is worse
          // Same best finish: waiting is at least bestFinish - firstStart - movieMinutes.
          const firstStart = path.length === 0 ? start : path[0].start;
          if (bestFinish === worst.end && bestFinish - firstStart - movieMinutes > worst.waiting) continue;
        }

        nodes++;
        const m = this.movies[j];
        const rest = remaining & ~(1 << j);
        path.push({ movie: m, start });
        if (rest === 0) {
          const cand: Candidate = {
            end,
            waiting: end - path[0].start - movieMinutes,
            id: path.map((p) => `${p.movie.id}@${p.start}`).join("|"),
            placements: path.slice(),
          };
          if (heap.size < k) heap.push(cand);
          else if (compareCandidates(cand, heap.peek()!) < 0) heap.replaceTop(cand);
        } else {
          visit(rest, end);
        }
        path.pop();
      }
    };

    if (k > 0) visit(all, 0);
    const schedules = heap
      .toArray()
      .sort(compareCandidates)
      .map((c) => buildSchedule(c.placements, this.buffer));
    return { schedules, nodesExplored: nodes };
  }
}

interface Candidate {
  end: number;
  waiting: number;
  id: string;
  placements: Placement[];
}

/** Mirrors compareByFinish. */
function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    a.end - b.end ||
    a.waiting - b.waiting ||
    compareStartSequences(a.placements, b.placements) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Largest subset of movies that can be watched, using forward bitmask DP:
 *   best[mask] = earliest end of a schedule covering exactly `mask`.
 * Returns the best schedule among the largest feasible subsets (earliest finish).
 */
export function bestSubset(movies: readonly NormalizedMovie[], buffer: number): Schedule | null {
  const n = movies.length;
  const size = 1 << n;
  const best = new Array<number>(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const lastMovie = new Int8Array(size).fill(-1);
  const lastStart = new Int32Array(size);

  for (let mask = 0; mask < size; mask++) {
    if (mask !== 0 && best[mask] === Infinity) continue;
    const earliest = mask === 0 ? -Infinity : best[mask] + buffer;
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue;
      const m = movies[j];
      const i = lowerBound(m.showtimes, earliest);
      if (i === m.showtimes.length) continue;
      const end = m.showtimes[i] + m.durationMinutes;
      const next = mask | (1 << j);
      if (end < best[next]) {
        best[next] = end;
        parent[next] = mask;
        lastMovie[next] = j;
        lastStart[next] = m.showtimes[i];
      }
    }
  }

  let bestMask = 0;
  for (let mask = 1; mask < size; mask++) {
    if (best[mask] === Infinity) continue;
    const bits = popcount(mask);
    const cur = popcount(bestMask);
    if (bits > cur || (bits === cur && best[mask] < best[bestMask])) bestMask = mask;
  }
  if (bestMask === 0) return null;

  const placements: Placement[] = [];
  for (let mask = bestMask; mask !== 0; mask = parent[mask]) {
    placements.unshift({ movie: movies[lastMovie[mask]], start: lastStart[mask] });
  }
  return buildSchedule(placements, buffer);
}

function popcount(x: number): number {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

/**
 * Schedules where no movies overlap, but at least one gap is shorter than the
 * buffer — combinations that look possible but are not. Search runs with a zero
 * buffer (pruned by its own DP) and keeps the closest misses. Best-effort:
 * bounded by a node budget.
 */
export function findNearMisses(movies: readonly NormalizedMovie[], buffer: number, limit: number): NearMiss[] {
  const zero = new ScheduleSearch(movies, 0);
  const all = (1 << movies.length) - 1;
  if (zero.rootFinish(all) === Infinity) return [];

  const found: NearMiss[] = [];
  const path: Placement[] = [];
  let nodes = 0;

  const visit = (remaining: number, prevEnd: number) => {
    for (let j = 0; j < movies.length && nodes < NEAR_MISS_NODE_BUDGET; j++) {
      if (!(remaining & (1 << j))) continue;
      const m = movies[j];
      const rest = remaining & ~(1 << j);
      const from = path.length === 0 ? 0 : lowerBound(m.showtimes, prevEnd);
      for (let i = from; i < m.showtimes.length && nodes < NEAR_MISS_NODE_BUDGET; i++) {
        const end = m.showtimes[i] + m.durationMinutes;
        if (zero.finish(rest, end) === Infinity) break;
        nodes++;
        path.push({ movie: m, start: m.showtimes[i] });
        if (rest === 0) {
          const schedule = buildSchedule(path, buffer);
          if (!schedule.valid) {
            found.push({ schedule, violations: validateSchedule(schedule.entries, buffer) });
          }
        } else {
          visit(rest, end);
        }
        path.pop();
      }
    }
  };
  visit(all, 0);

  const total = (nm: NearMiss) => nm.violations.reduce((s, v) => s + v.violationMinutes, 0);
  return found
    .sort((a, b) => a.violations.length - b.violations.length || total(a) - total(b) || compareByFinish(a.schedule, b.schedule))
    .slice(0, limit);
}

/** Minimal binary max-heap (worst element on top) used for top-K selection. */
class MaxHeap<T> {
  private items: T[] = [];
  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size() {
    return this.items.length;
  }
  peek(): T | undefined {
    return this.items[0];
  }
  push(item: T) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.items[i], this.items[parent]) <= 0) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }
  replaceTop(item: T) {
    this.items[0] = item;
    const n = this.items.length;
    let i = 0;
    while (true) {
      const l = 2 * i + 1;
      const r = l + 1;
      let largest = i;
      if (l < n && this.compare(this.items[l], this.items[largest]) > 0) largest = l;
      if (r < n && this.compare(this.items[r], this.items[largest]) > 0) largest = r;
      if (largest === i) return;
      [this.items[i], this.items[largest]] = [this.items[largest], this.items[i]];
      i = largest;
    }
  }
  toArray(): T[] {
    return this.items.slice();
  }
}
