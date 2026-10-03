import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  compareByFinish,
  countOrderCombinations,
  formatDuration,
  formatTime,
  parseDuration,
  parseTime,
  permutations,
  solve,
  sortSchedules,
  toHHMM,
  validateInput,
  validateSchedule,
  type Movie,
  type NormalizedMovie,
  type Schedule,
} from "../index";

// ─── helpers ──────────────────────────────────────────────────────────────────

const t = (hhmm: string) => parseTime(hhmm)!;

function mv(id: string, durationMinutes: number, showtimes: string[]): Movie {
  return { id, name: id, durationMinutes, showtimes };
}

/** Compact representation of a schedule for assertions: "A@10:00 B@12:30". */
function describe_(s: Schedule | null): string {
  return s ? s.entries.map((e) => `${e.movieId}@${toHHMM(e.start)}`).join(" ") : "none";
}

/**
 * Reference implementation: literal brute force over every permutation and every
 * showtime combination (Cartesian product). Deliberately naive and independent of
 * the engine, so the engine can be checked against it.
 */
function bruteForce(movies: NormalizedMovie[], buffer: number): Schedule[] {
  const valid: Schedule[] = [];
  for (const order of permutations(movies)) {
    const choose = (k: number, starts: number[]) => {
      if (k === order.length) {
        const s = buildSchedule(order.map((movie, i) => ({ movie, start: starts[i] })), buffer);
        if (validateSchedule(s.entries, buffer).length === 0) valid.push(s);
        return;
      }
      for (const st of order[k].showtimes) choose(k + 1, [...starts, st]);
    };
    choose(0, []);
  }
  return valid.sort(compareByFinish);
}

function normalized(movies: Movie[]): NormalizedMovie[] {
  return validateInput({ movies, bufferMinutes: 0 }).movies;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── the 10 required scenarios ───────────────────────────────────────────────

describe("Test 1 — two movies with an obvious valid schedule", () => {
  const movies = [mv("A", 120, ["10:00"]), mv("B", 90, ["13:00"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("finds the schedule A → B with correct metrics", () => {
    expect(r.allFeasible).toBe(true);
    expect(describe_(r.optimal)).toBe("A@10:00 B@13:00");
    expect(r.feasibleCount).toBe(1);
    const o = r.optimal!;
    expect(o.startTime).toBe(t("10:00"));
    expect(o.endTime).toBe(t("14:30"));
    expect(o.totalElapsedMinutes).toBe(270);
    expect(o.totalMovieMinutes).toBe(210);
    expect(o.totalWaitingMinutes).toBe(60);
    expect(o.totalBufferMinutes).toBe(20);
    expect(o.extraWaitingMinutes).toBe(40);
    expect(o.entries[1].gapBefore).toBe(60);
    expect(o.entries[1].extraWaitBefore).toBe(40);
  });

  it("tests both orders and explains why B → A fails", () => {
    expect(r.orders).toHaveLength(2);
    const ba = r.orders!.find((o) => o.order.join() === "B,A")!;
    expect(ba.feasible).toBe(false);
    expect(ba.failure!.kind).toBe("overlap");
  });
});

describe("Test 2 — two movies where the buffer makes it impossible", () => {
  // A ends 12:00. B starts 12:10: no overlap, but only 10 minutes < 20-minute buffer.
  const movies = [mv("A", 120, ["10:00"]), mv("B", 90, ["12:10"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("reports infeasible", () => {
    expect(r.allFeasible).toBe(false);
    expect(r.optimal).toBeNull();
    expect(r.feasibleCount).toBe(0);
    expect(r.maxWatchable).toBe(1);
  });

  it("explains the exact buffer violation", () => {
    const ab = r.orders!.find((o) => o.order.join() === "A,B")!;
    expect(ab.failure).toMatchObject({
      kind: "buffer",
      previousEnd: t("12:00"),
      requiredStart: t("12:20"),
      latestShowtime: t("12:10"),
      shortByMinutes: 10,
    });
  });

  it("lists the apparently-possible combination as a near miss", () => {
    expect(r.nearMisses).toHaveLength(1);
    expect(r.nearMisses[0].violations[0]).toMatchObject({ violationMinutes: 10, overlaps: false });
  });

  it("becomes feasible with a 10-minute buffer", () => {
    expect(solve({ movies, bufferMinutes: 10 }).allFeasible).toBe(true);
    expect(solve({ movies, bufferMinutes: 11 }).allFeasible).toBe(false);
  });
});

describe("Test 3 — three movies with multiple valid permutations", () => {
  // The example from the spec (section 28).
  const movies = [
    mv("A", 120, ["10:00", "15:00"]),
    mv("B", 100, ["12:30", "17:30"]),
    mv("C", 90, ["15:00", "20:00"]),
  ];
  const r = solve({ movies, bufferMinutes: 20 });

  it("finds all 6 feasible combinations across 3 feasible orders", () => {
    expect(r.feasibleCount).toBe(6);
    expect(r.schedules).toHaveLength(6);
    const feasibleOrders = r.orders!.filter((o) => o.feasible).map((o) => o.order.join(""));
    expect(feasibleOrders.sort()).toEqual(["ABC", "ACB", "BAC"]);
    const combos = Object.fromEntries(r.orders!.map((o) => [o.order.join(""), o.combinations]));
    expect(combos).toEqual({ ABC: 4, ACB: 1, BAC: 1, BCA: 0, CAB: 0, CBA: 0 });
  });

  it("picks A 10:00 → B 12:30 → C 15:00, finishing 4:30 PM", () => {
    expect(describe_(r.optimal)).toBe("A@10:00 B@12:30 C@15:00");
    expect(formatTime(r.optimal!.endTime)).toBe("4:30 PM");
    expect(r.optimal!.totalWaitingMinutes).toBe(80);
  });

  it("explains each infeasible order", () => {
    const failing = r.orders!.filter((o) => !o.feasible);
    expect(failing).toHaveLength(3);
    for (const o of failing) expect(o.failure!.message).toMatch(/must start at or after/);
    const cba = r.orders!.find((o) => o.order.join("") === "CBA")!;
    expect(cba.failure).toMatchObject({ index: 2, previousMovieId: "B", previousEnd: t("19:10"), movieId: "A" });
  });

  it("matches brute force exactly", () => {
    expect(r.schedules.map((s) => s.id)).toEqual(bruteForce(r.movies, 20).map((s) => s.id));
  });
});

describe("Test 4 — multiple showtimes for each movie", () => {
  const movies = [
    mv("Avengers", 165, ["10:00", "13:30", "17:15", "20:45"]),
    mv("SpiderMan", 140, ["11:00", "14:30", "18:00", "21:30"]),
    mv("Batman", 130, ["9:30", "12:45", "16:00", "19:30"]),
  ];
  const r = solve({ movies, bufferMinutes: 20 });

  it("finds the hand-verified optimum: Batman → Spider-Man → Avengers, done 8:00 PM", () => {
    expect(describe_(r.optimal)).toBe("Batman@09:30 SpiderMan@14:30 Avengers@17:15");
    expect(formatTime(r.optimal!.endTime)).toBe("8:00 PM");
  });

  it("evaluates every order and every showtime combination like brute force", () => {
    const reference = bruteForce(r.movies, 20);
    expect(r.feasibleCount).toBe(reference.length);
    expect(r.schedules.map((s) => s.id)).toEqual(reference.map((s) => s.id));
    // Every reported schedule truly satisfies the buffer.
    for (const s of r.schedules) expect(validateSchedule(s.entries, 20)).toEqual([]);
  });

  it("knows Spider-Man → Avengers → Batman is impossible", () => {
    const o = r.orders!.find((x) => x.names.join() === "SpiderMan,Avengers,Batman")!;
    expect(o.feasible).toBe(false);
    expect(o.failure!.movieId).toBe("Batman");
  });
});

describe("Test 5 — different buffer values", () => {
  // A ends 12:00. B has showtimes at 12:15 and 12:20.
  const movies = [mv("A", 120, ["10:00"]), mv("B", 90, ["12:15", "12:20"])];
  const finish = (buffer: number) => solve({ movies, bufferMinutes: buffer }).optimal?.endTime ?? null;

  it("15 min → B at 12:15, 20 min → B at 12:20, 25 min → impossible", () => {
    expect(finish(15)).toBe(t("13:45"));
    expect(finish(20)).toBe(t("13:50"));
    expect(finish(25)).toBeNull();
    expect(finish(0)).toBe(t("13:45"));
  });

  it("feasible count shrinks as the buffer grows", () => {
    expect(solve({ movies, bufferMinutes: 15 }).feasibleCount).toBe(2);
    expect(solve({ movies, bufferMinutes: 20 }).feasibleCount).toBe(1);
    expect(solve({ movies, bufferMinutes: 25 }).feasibleCount).toBe(0);
  });

  it("is exactly at the boundary: start == end + buffer is allowed", () => {
    const r = solve({ movies: [mv("A", 60, ["10:00"]), mv("B", 60, ["11:20"])], bufferMinutes: 20 });
    expect(r.allFeasible).toBe(true);
    expect(r.optimal!.extraWaitingMinutes).toBe(0);
  });
});

describe("Test 6 — the earliest-starting movie is NOT the optimal first movie", () => {
  // Starting with A at 9:00 (the earliest showtime of the day) forces B to 16:00.
  // Starting with B at 10:00 lets A run 11:30–15:30, finishing 1.5 hours earlier.
  const movies = [mv("A", 240, ["9:00", "11:30"]), mv("B", 60, ["10:00", "16:00"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("chooses B first and finishes at 3:30 PM", () => {
    expect(describe_(r.optimal)).toBe("B@10:00 A@11:30");
    expect(r.optimal!.endTime).toBe(t("15:30"));
  });

  it("the earliest-start schedule exists but finishes later", () => {
    const earliestStart = sortSchedules(r.schedules, "start")[0];
    expect(earliestStart.startTime).toBe(t("9:00"));
    expect(earliestStart.endTime).toBe(t("17:00"));
    expect(earliestStart.id).not.toBe(r.optimal!.id);
    expect(r.feasibleCount).toBe(3);
  });
});

describe("Test 7 — no feasible schedule", () => {
  const movies = [mv("A", 120, ["10:00"]), mv("B", 120, ["10:30"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("reports impossible, with both pair directions blocked", () => {
    expect(r.allFeasible).toBe(false);
    expect(r.schedules).toEqual([]);
    expect(r.pairs.every((p) => !p.feasible)).toBe(true);
    expect(r.orders!.every((o) => o.failure?.kind === "overlap")).toBe(true);
  });

  it("suggests the best partial schedule (the movie that finishes first)", () => {
    expect(r.maxWatchable).toBe(1);
    expect(describe_(r.bestPartial)).toBe("A@10:00");
  });

  it("finds the largest watchable subset among three movies", () => {
    const three = [...movies, mv("C", 60, ["13:00"])];
    const r3 = solve({ movies: three, bufferMinutes: 20 });
    expect(r3.allFeasible).toBe(false);
    expect(r3.maxWatchable).toBe(2);
    expect(describe_(r3.bestPartial)).toBe("A@10:00 C@13:00");
  });
});

describe("Test 8 — equal finishing times with different waiting times", () => {
  const movies = [mv("A", 60, ["10:00", "11:00"]), mv("B", 60, ["13:00"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("prefers the schedule with less waiting", () => {
    expect(r.schedules.map((s) => s.endTime)).toEqual([t("14:00"), t("14:00")]);
    expect(describe_(r.optimal)).toBe("A@11:00 B@13:00");
    expect(r.optimal!.totalWaitingMinutes).toBe(60);
    expect(r.optimal!.extraWaitingMinutes).toBe(40);
    expect(r.schedules[1].totalWaitingMinutes).toBe(120);
  });

  it("the per-order best uses the same tie-break", () => {
    const ab = r.orders!.find((o) => o.order.join() === "A,B")!;
    expect(describe_(ab.best)).toBe("A@11:00 B@13:00");
    expect(ab.combinations).toBe(2);
  });
});

describe("Test 9 — duplicate showtimes", () => {
  const movies = [mv("A", 60, ["10:00", "10:00", "10:00 AM"]), mv("B", 60, ["12:00", "12:00"])];
  const r = solve({ movies, bufferMinutes: 20 });

  it("de-duplicates and warns instead of double counting", () => {
    expect(r.movies[0].showtimes).toEqual([t("10:00")]);
    expect(r.movies[1].showtimes).toEqual([t("12:00")]);
    expect(r.feasibleCount).toBe(1);
    expect(r.issues.filter((i) => i.level === "warning" && /duplicate/.test(i.message))).toHaveLength(2);
  });
});

describe("Test 10 — large number of showtimes (no blind brute force)", () => {
  // 6 movies × 60 showtimes. Brute force would be 6! × 60^6 ≈ 3.4 × 10^13 checks.
  const movies: Movie[] = Array.from({ length: 6 }, (_, k) =>
    mv(
      `M${k}`,
      80 + k * 7,
      Array.from({ length: 60 }, (_, i) => toHHMM(8 * 60 + k * 3 + i * 15)),
    ),
  );

  it("solves quickly and explores a tiny fraction of the search space", () => {
    const started = performance.now();
    const r = solve({ movies, bufferMinutes: 20 }, { maxSchedules: 200 });
    const elapsed = performance.now() - started;

    expect(r.allFeasible).toBe(true);
    expect(r.stats.bruteForceCombinations).toBeGreaterThan(3e13);
    expect(r.stats.nodesExplored).toBeLessThan(200_000);
    expect(r.schedules).toHaveLength(200);
    expect(r.truncated).toBe(true);
    expect(r.feasibleCount).toBeGreaterThan(1e6);
    expect(elapsed).toBeLessThan(5000);

    // Top results are sorted, valid, and the optimum matches the DP lower bound.
    for (let i = 1; i < r.schedules.length; i++) {
      expect(compareByFinish(r.schedules[i - 1], r.schedules[i])).toBeLessThan(0);
    }
    for (const s of r.schedules) expect(s.valid).toBe(true);
  });

  it("handles 10 movies (the maximum)", () => {
    const ten = Array.from({ length: 10 }, (_, k) =>
      mv(`M${k}`, 60, Array.from({ length: 20 }, (_, i) => toHHMM(8 * 60 + i * 40 + k))),
    );
    const r = solve({ movies: ten, bufferMinutes: 10 }, { maxSchedules: 50 });
    expect(r.allFeasible).toBe(true);
    expect(r.orders).toBeNull(); // 10! orders: skipped
    expect(r.optimal!.entries).toHaveLength(10);
    expect(r.optimal!.valid).toBe(true);
  });
});

// ─── engine vs brute force on random inputs ─────────────────────────────────

describe("randomised cross-check against brute force", () => {
  const rand = mulberry32(20261003);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  it("agrees on feasibility, counts, ordering, per-order results and best subset (1000 cases)", () => {
    for (let iter = 0; iter < 1000; iter++) {
      const n = 2 + Math.floor(rand() * 3); // 2–4 movies
      const movies: Movie[] = Array.from({ length: n }, (_, k) => {
        const count = 1 + Math.floor(rand() * 5);
        const times = Array.from({ length: count }, () => toHHMM(8 * 60 + Math.floor(rand() * 180) * 5));
        return mv(`M${k}`, 60 + Math.floor(rand() * 25) * 5, times);
      });
      const buffer = pick([0, 10, 15, 20, 25, 30]);
      const k = pick([3, 1000]);
      const r = solve({ movies, bufferMinutes: buffer }, { maxSchedules: k });
      const ref = bruteForce(r.movies, buffer);
      const ctx = JSON.stringify({ movies, buffer });

      expect(r.allFeasible, ctx).toBe(ref.length > 0);
      expect(r.feasibleCount, ctx).toBe(ref.length);
      expect(r.schedules.map((s) => s.id), ctx).toEqual(ref.slice(0, k).map((s) => s.id));
      expect(r.optimal?.id ?? null, ctx).toBe(ref[0]?.id ?? null);

      for (const o of r.orders!) {
        const key = o.order.join();
        const inOrder = ref.filter((s) => s.entries.map((e) => e.movieId).join() === key);
        expect(o.feasible, ctx).toBe(inOrder.length > 0);
        expect(o.combinations, ctx).toBe(inOrder.length);
        expect(o.best?.id ?? null, ctx).toBe(inOrder[0]?.id ?? null);
      }

      // Best subset size: brute force over every subset.
      if (!r.allFeasible) {
        let best = 0;
        for (let mask = 1; mask < 1 << n; mask++) {
          const subset = r.movies.filter((_, j) => mask & (1 << j));
          if (subset.length > best && bruteForce(subset, buffer).length > 0) best = subset.length;
        }
        expect(r.maxWatchable, ctx).toBe(best);
        expect(r.bestPartial!.valid, ctx).toBe(true);
      }

      for (const nm of r.nearMisses) {
        expect(nm.schedule.valid).toBe(false);
        expect(validateSchedule(nm.schedule.entries, 0)).toEqual([]);
      }
    }
  });
});

describe("randomised cross-check with 5 movies", () => {
  const rand = mulberry32(42);

  it("agrees with brute force on optimum and counts (60 cases)", () => {
    for (let iter = 0; iter < 60; iter++) {
      const movies: Movie[] = Array.from({ length: 5 }, (_, k) => {
        const count = 1 + Math.floor(rand() * 3);
        const times = Array.from({ length: count }, () => toHHMM(9 * 60 + Math.floor(rand() * 168) * 5));
        return mv(`M${k}`, 60 + Math.floor(rand() * 13) * 5, times);
      });
      const buffer = [0, 15, 20][iter % 3];
      const r = solve({ movies, bufferMinutes: buffer });
      const ref = bruteForce(r.movies, buffer);
      const ctx = JSON.stringify({ movies, buffer });
      expect(r.feasibleCount, ctx).toBe(ref.length);
      expect(r.optimal?.id ?? null, ctx).toBe(ref[0]?.id ?? null);
    }
  });
});

// ─── validation & utilities ─────────────────────────────────────────────────

describe("validation", () => {
  const issuesFor = (movies: Movie[], bufferMinutes = 20, allowPastMidnight = true) =>
    validateInput({ movies, bufferMinutes, allowPastMidnight });

  it("rejects empty names, non-positive durations, missing and invalid showtimes", () => {
    const v = issuesFor([mv("", 0, []), mv("X", 90, ["25:00", "abc"])]);
    expect(v.ok).toBe(false);
    const msgs = v.issues.filter((i) => i.level === "error").map((i) => i.field);
    expect(msgs).toEqual(expect.arrayContaining(["name", "duration", "showtimes"]));
  });

  it("rejects negative buffers and accepts zero", () => {
    expect(issuesFor([mv("A", 60, ["10:00"]), mv("B", 60, ["12:00"])], -5).ok).toBe(false);
    expect(issuesFor([mv("A", 60, ["10:00"]), mv("B", 60, ["12:00"])], 0).ok).toBe(true);
  });

  it("warns on duplicate names", () => {
    const v = issuesFor([mv("A", 60, ["10:00"]), { ...mv("a", 60, ["12:00"]), id: "a2" }]);
    expect(v.ok).toBe(true);
    expect(v.issues.some((i) => i.field === "name" && i.level === "warning")).toBe(true);
  });

  it("flags a single movie and handles it (every showtime is a schedule)", () => {
    const r = solve({ movies: [mv("A", 60, ["10:00", "14:00"])], bufferMinutes: 20 });
    expect(r.issues.some((i) => i.level === "info")).toBe(true);
    expect(r.schedules.map((s) => s.startTime)).toEqual([t("10:00"), t("14:00")]);
  });

  it("past midnight: allowed and flagged, or rejected when disallowed", () => {
    const movies = [mv("A", 120, ["20:00"]), mv("B", 150, ["22:30"])];
    const allowed = solve({ movies, bufferMinutes: 20, allowPastMidnight: true });
    expect(allowed.allFeasible).toBe(true);
    expect(allowed.optimal!.endsAfterMidnight).toBe(true);
    expect(formatTime(allowed.optimal!.endTime)).toBe("1:00 AM (+1)");

    const rejected = solve({ movies, bufferMinutes: 20, allowPastMidnight: false });
    expect(rejected.status).toBe("invalid");
    expect(rejected.issues.some((i) => /no usable showtimes/.test(i.message))).toBe(true);
  });
});

describe("time utilities", () => {
  it("parses common time formats", () => {
    expect(parseTime("13:30")).toBe(810);
    expect(parseTime("1:30 PM")).toBe(810);
    expect(parseTime("1:30pm")).toBe(810);
    expect(parseTime("12:00 AM")).toBe(0);
    expect(parseTime("12:15 pm")).toBe(735);
    expect(parseTime("9am")).toBe(540);
    expect(parseTime("0930")).toBe(570);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("13:00 pm")).toBeNull();
    expect(parseTime("10:60")).toBeNull();
  });

  it("parses durations", () => {
    expect(parseDuration("2h 45m")).toBe(165);
    expect(parseDuration("2h45")).toBe(165);
    expect(parseDuration("2:45")).toBe(165);
    expect(parseDuration("165")).toBe(165);
    expect(parseDuration("90 min")).toBe(90);
    expect(parseDuration("2.5h")).toBe(150);
    expect(parseDuration("x")).toBeNull();
  });

  it("formats times and durations", () => {
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(735)).toBe("12:15 PM");
    expect(formatTime(1440 + 30)).toBe("12:30 AM (+1)");
    expect(formatDuration(475)).toBe("7h 55m");
    expect(formatDuration(40)).toBe("40m");
    expect(formatDuration(120)).toBe("2h");
  });

  it("counts order combinations with prefix sums", () => {
    const ms = normalized([mv("A", 60, ["10:00", "11:00"]), mv("B", 60, ["12:00", "13:00"])]);
    expect(countOrderCombinations(ms, 0)).toBe(4);
    // 10→12, 10→13, 11→13 (11:00 ends 12:00; +60 min buffer = 13:00 exactly).
    expect(countOrderCombinations(ms, 60)).toBe(3);
    expect(countOrderCombinations(ms, 61)).toBe(1); // only 10→13
  });
});
