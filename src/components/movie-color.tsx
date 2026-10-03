import { cn } from "@/lib/utils";

/** Fixed categorical order; movies beyond 8 fall back to neutral (rows are always labelled). */
export function colorVar(slot: number | undefined): string {
  return slot !== undefined && slot >= 0 && slot < 8 ? `var(--series-${slot + 1})` : "var(--series-other)";
}

export type ColorLookup = (movieId: string) => string;

export function MovieSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
