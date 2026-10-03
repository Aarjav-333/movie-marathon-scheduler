import { MAX_MOVIES, parseTime, toHHMM, type Movie } from "@/lib/scheduler";

/** A movie in the editor. `color` is a fixed categorical slot that follows the movie. */
export interface AppMovie extends Movie {
  color: number;
}

/** Everything the user enters. This is what gets persisted and shared. */
export interface AppState {
  /** ISO date "YYYY-MM-DD". Informational: showtimes are all on this day. */
  date: string;
  bufferMinutes: number;
  allowPastMidnight: boolean;
  movies: AppMovie[];
}

/** Smallest color slot not used by any of `movies`. */
export function nextColor(movies: readonly { color: number }[]): number {
  const used = new Set(movies.map((m) => m.color));
  let c = 0;
  while (used.has(c)) c++;
  return c;
}

/** Assign color slots in list order, keeping valid unique existing slots. */
export function withColors(movies: readonly (Movie & { color?: unknown })[]): AppMovie[] {
  const out: AppMovie[] = [];
  for (const m of movies) {
    const keep = typeof m.color === "number" && Number.isInteger(m.color) && m.color >= 0 && !out.some((o) => o.color === m.color);
    out.push({ ...m, color: keep ? (m.color as number) : -1 });
  }
  for (const m of out) if (m.color === -1) m.color = nextColor(out.filter((o) => o.color !== -1));
  return out;
}

export const BUFFER_PRESETS = [15, 20, 25] as const;
export const DEFAULT_BUFFER = 20;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const movie = (name: string, durationMinutes: number, showtimes: string[]): Movie => ({
  id: newId(),
  name,
  durationMinutes,
  showtimes: showtimes.map((s) => toHHMM(parseTime(s)!)),
});

export interface Demo {
  id: string;
  label: string;
  description: string;
  bufferMinutes: number;
  movies: () => Movie[];
}

export const DEMOS: Demo[] = [
  {
    id: "blockbuster",
    label: "Blockbuster Saturday",
    description: "Three big releases, four showtimes each.",
    bufferMinutes: 20,
    movies: () => [
      movie("Avengers: Doomsday", 165, ["10:00 AM", "1:30 PM", "5:15 PM", "8:45 PM"]),
      movie("Spider-Man", 140, ["11:00 AM", "2:30 PM", "6:00 PM", "9:30 PM"]),
      movie("Batman", 130, ["9:30 AM", "12:45 PM", "4:00 PM", "7:30 PM"]),
    ],
  },
  {
    id: "tight",
    label: "Tight buffer",
    description: "Works with 15 min, finishes 2 h later with 20 min, impossible with 25 min.",
    bufferMinutes: 20,
    movies: () => [
      movie("Neon Harbor", 120, ["10:00 AM", "12:35 PM"]),
      movie("The Quiet Orbit", 100, ["12:15 PM", "2:20 PM"]),
      movie("Paper Moons", 90, ["2:15 PM", "4:20 PM"]),
    ],
  },
  {
    id: "trap",
    label: "Earliest start is a trap",
    description: "Starting with the 9:00 AM show finishes 90 minutes later than starting at 10:00.",
    bufferMinutes: 20,
    movies: () => [
      movie("The Long Voyage", 240, ["9:00 AM", "11:30 AM"]),
      movie("Pocket Universe", 60, ["10:00 AM", "4:00 PM"]),
    ],
  },
  {
    id: "textbook",
    label: "Textbook A/B/C",
    description: "Three movies, two showtimes each: 6 feasible combinations.",
    bufferMinutes: 20,
    movies: () => [
      movie("Movie A", 120, ["10:00", "15:00"]),
      movie("Movie B", 100, ["12:30", "17:30"]),
      movie("Movie C", 90, ["15:00", "20:00"]),
    ],
  },
];

export function demoState(id = DEMOS[0].id, date = todayISO()): AppState {
  const demo = DEMOS.find((d) => d.id === id) ?? DEMOS[0];
  return { date, bufferMinutes: demo.bufferMinutes, allowPastMidnight: true, movies: withColors(demo.movies()) };
}

export function blankMovie(existing: readonly AppMovie[]): AppMovie {
  return { id: newId(), name: "", durationMinutes: 120, showtimes: [], color: nextColor(existing) };
}

export function emptyState(date = todayISO()): AppState {
  const first = blankMovie([]);
  return { date, bufferMinutes: DEFAULT_BUFFER, allowPastMidnight: true, movies: [first, blankMovie([first])] };
}

/** Defensive parse of untrusted data (localStorage, URLs) into a valid AppState shape. */
export function sanitizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.movies)) return null;
  const movies = r.movies.slice(0, MAX_MOVIES * 2).flatMap((m): (Movie & { color?: unknown })[] => {
    if (!m || typeof m !== "object") return [];
    const mm = m as Record<string, unknown>;
    return [
      {
        id: typeof mm.id === "string" && mm.id ? mm.id : newId(),
        name: typeof mm.name === "string" ? mm.name.slice(0, 200) : "",
        durationMinutes: typeof mm.durationMinutes === "number" ? mm.durationMinutes : 0,
        showtimes: Array.isArray(mm.showtimes)
          ? mm.showtimes.filter((s): s is string => typeof s === "string").slice(0, 500)
          : [],
        color: mm.color,
      },
    ];
  });
  return {
    date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : todayISO(),
    bufferMinutes: typeof r.bufferMinutes === "number" ? r.bufferMinutes : DEFAULT_BUFFER,
    allowPastMidnight: typeof r.allowPastMidnight === "boolean" ? r.allowPastMidnight : true,
    movies: withColors(movies),
  };
}

// ─── localStorage persistence ───────────────────────────────────────────────

const DRAFT_KEY = "movie-marathon:draft:v1";
const SAVED_KEY = "movie-marathon:saved:v1";

function read(key: string): AppState | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? sanitizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function write(key: string, state: AppState): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** The auto-saved working copy, restored on refresh. */
export const loadDraft = () => read(DRAFT_KEY);
export const saveDraft = (state: AppState) => write(DRAFT_KEY, state);

/** An explicit snapshot the user saves and loads on demand. */
export const loadSnapshot = () => read(SAVED_KEY);
export const saveSnapshot = (state: AppState) => write(SAVED_KEY, state);
export function hasSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SAVED_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearStorage() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage unavailable (private mode etc.): nothing to clear.
  }
}

// ─── Shareable URLs ─────────────────────────────────────────────────────────
//
// The whole input plus the selected schedule is packed into the URL hash as
// base64url-encoded JSON, so nothing is stored on a server:
//   { v, d: date, b: buffer, p: allowPastMidnight, m: [[name, minutes, "HH:MM,…"]], s: "movieIndex@start,…" }

interface SharePayload {
  v: 1;
  d: string;
  b: number;
  p: 0 | 1;
  m: [string, number, string][];
  s?: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Encode state (and optionally the selected schedule id) into a URL hash fragment value. */
export function encodeShare(state: AppState, selectedScheduleId?: string | null): string {
  const indexById = new Map(state.movies.map((m, i) => [m.id, i]));
  const payload: SharePayload = {
    v: 1,
    d: state.date,
    b: state.bufferMinutes,
    p: state.allowPastMidnight ? 1 : 0,
    m: state.movies.map((m) => [m.name, m.durationMinutes, m.showtimes.join(",")]),
  };
  if (selectedScheduleId) {
    const parts = selectedScheduleId.split("|").map((part) => {
      const [id, start] = part.split("@");
      return `${indexById.get(id)}@${start}`;
    });
    if (parts.every((p) => !p.startsWith("undefined"))) payload.s = parts.join(",");
  }
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShare(data: string): { state: AppState; selectedScheduleId: string | null } | null {
  try {
    const p = JSON.parse(fromBase64Url(data)) as SharePayload;
    if (p.v !== 1 || !Array.isArray(p.m)) return null;
    const state = sanitizeState({
      date: p.d,
      bufferMinutes: p.b,
      allowPastMidnight: p.p !== 0,
      movies: p.m.map(([name, durationMinutes, times]) => ({
        id: newId(),
        name,
        durationMinutes,
        showtimes: typeof times === "string" && times ? times.split(",") : [],
      })),
    });
    if (!state) return null;
    let selectedScheduleId: string | null = null;
    if (typeof p.s === "string" && p.s) {
      const parts = p.s.split(",").map((part) => {
        const [idx, start] = part.split("@");
        const m = state.movies[Number(idx)];
        return m ? `${m.id}@${start}` : null;
      });
      if (parts.every(Boolean)) selectedScheduleId = parts.join("|");
    }
    return { state, selectedScheduleId };
  } catch {
    return null;
  }
}
