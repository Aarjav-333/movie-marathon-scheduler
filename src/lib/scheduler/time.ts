export const MINUTES_PER_DAY = 24 * 60;

const TIME_RE = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?$/;

/**
 * Parse a time of day into minutes after midnight.
 * Accepts "13:30", "1:30 PM", "1:30pm", "1pm", "0930", "930a". Returns null if invalid.
 */
export function parseTime(input: string): number | null {
  const match = TIME_RE.exec(input.trim().toLowerCase());
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.[0];

  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === "p") hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Minutes after midnight → "HH:MM" (24h), the storage format. */
export function toHHMM(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes after midnight → "1:30 PM". Times past midnight get a "+1" day marker. */
export function formatTime(minutes: number, { dayMarker = true } = {}): string {
  const day = Math.floor(minutes / MINUTES_PER_DAY);
  const m = minutes - day * MINUTES_PER_DAY;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const label = `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
  return dayMarker && day > 0 ? `${label} (+${day})` : label;
}

/** 165 → "2h 45m", 40 → "40m", 120 → "2h", 0 → "0m". */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/**
 * Parse a duration: "2h 45m", "2h45", "2:45", "165", "165m", "2.5h". Returns null if invalid.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let match = /^(\d+):(\d{1,2})$/.exec(s);
  if (match) {
    const m = Number(match[2]);
    return m < 60 ? Number(match[1]) * 60 + m : null;
  }
  match = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?$/.exec(s);
  if (match && (match[1] || match[2])) {
    return Math.round(Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
  }
  match = /^(\d+)h\s*(\d+)$/.exec(s);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

/** Index of the first element >= target in an ascending array (arr.length if none). */
export function lowerBound(arr: readonly number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the last element <= target in an ascending array (-1 if none). */
export function upperIndex(arr: readonly number[], target: number): number {
  return lowerBound(arr, target + 1) - 1;
}
