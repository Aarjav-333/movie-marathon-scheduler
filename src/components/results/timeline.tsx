"use client";

import { useState } from "react";
import type { ColorLookup } from "@/components/movie-color";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatTime, type NormalizedMovie, type Schedule } from "@/lib/scheduler";
import { cn } from "@/lib/utils";

interface TimelineProps {
  schedule: Schedule | null;
  movies: NormalizedMovie[];
  bufferMinutes: number;
  colorFor: ColorLookup;
}

interface Segment {
  kind: "movie" | "buffer" | "wait";
  start: number;
  end: number;
  label: string;
  movieId?: string;
  index?: number;
}

/**
 * Gantt-style timeline: a "Your day" strip showing movie / buffer / extra-wait
 * segments of the selected schedule, then one row per movie with every showtime
 * (selected one solid, alternatives faint) so it is visible why the choice was made.
 */
export function Timeline({ schedule, movies, bufferMinutes, colorFor }: TimelineProps) {
  const [readout, setReadout] = useState<string | null>(null);

  const allStarts = movies.flatMap((m) => m.showtimes);
  const allEnds = movies.flatMap((m) => m.showtimes.map((s) => s + m.durationMinutes));
  if (allStarts.length === 0) return null;
  const d0 = Math.floor(Math.min(...allStarts) / 60) * 60;
  const d1 = Math.max(d0 + 240, Math.ceil(Math.max(...allEnds) / 60) * 60);
  const span = d1 - d0;
  const pct = (t: number) => ((t - d0) / span) * 100;

  const hours = span / 60;
  const ticks = Array.from({ length: hours + 1 }, (_, i) => d0 + i * 60);
  // Label density: keep tick labels from colliding on narrow tracks.
  const desktopStep = hours <= 8 ? 1 : hours <= 16 ? 2 : 3;
  const mobileStep = hours <= 5 ? 1 : hours <= 10 ? 2 : hours <= 15 ? 3 : 4;

  const segments: Segment[] = [];
  schedule?.entries.forEach((e, i) => {
    if (i > 0) {
      const prevEnd = schedule.entries[i - 1].end;
      const bufferEnd = Math.min(prevEnd + bufferMinutes, e.start);
      if (bufferEnd > prevEnd) {
        segments.push({
          kind: "buffer",
          start: prevEnd,
          end: bufferEnd,
          label: `Required buffer: ${formatTime(prevEnd)} → ${formatTime(bufferEnd)} (${formatDuration(bufferEnd - prevEnd)})`,
        });
      }
      if (e.start > bufferEnd) {
        segments.push({
          kind: "wait",
          start: bufferEnd,
          end: e.start,
          label: `Extra waiting: ${formatTime(bufferEnd)} → ${formatTime(e.start)} (${formatDuration(e.start - bufferEnd)})`,
        });
      }
    }
    segments.push({
      kind: "movie",
      start: e.start,
      end: e.end,
      movieId: e.movieId,
      index: i + 1,
      label: `${i + 1}. ${e.movieName}: ${formatTime(e.start)} → ${formatTime(e.end)} (${formatDuration(e.durationMinutes)})`,
    });
  });

  const selectedStart = new Map(schedule?.entries.map((e) => [e.movieId, e.start]));
  const rowOrder = [
    ...(schedule?.entries.map((e) => movies.find((m) => m.id === e.movieId)!) ?? []),
    ...movies.filter((m) => !selectedStart.has(m.id)),
  ];

  const hint = "Hover or tap a bar for details.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription>
          The selected schedule on top; below, every showtime of each movie. Faint bars are the showtimes not chosen.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2" onPointerLeave={() => setReadout(null)}>
          {schedule && (
            <Row label="Your day" sublabel={`${formatTime(schedule.startTime)} → ${formatTime(schedule.endTime)}`} strong>
              <Track ticks={ticks} pct={pct}>
                {segments.map((s, i) => (
                  <Bar
                    key={i}
                    left={pct(s.start)}
                    width={pct(s.end) - pct(s.start)}
                    label={s.label}
                    onShow={setReadout}
                    className={cn(
                      s.kind === "buffer" && "hatch-buffer border border-buffer/50",
                      s.kind === "wait" && "bg-wait",
                    )}
                    style={s.kind === "movie" ? { backgroundColor: colorFor(s.movieId!) } : undefined}
                  >
                    {s.kind === "movie" && (
                      <span className="flex size-4 items-center justify-center rounded-full bg-background/90 text-[10px] font-semibold text-foreground">
                        {s.index}
                      </span>
                    )}
                  </Bar>
                ))}
              </Track>
            </Row>
          )}

          {rowOrder.map((m) => {
            const chosen = selectedStart.get(m.id);
            const color = colorFor(m.id);
            return (
              <Row
                key={m.id}
                label={m.name}
                sublabel={chosen !== undefined ? `${formatTime(chosen)} → ${formatTime(chosen + m.durationMinutes)}` : "not scheduled"}
                color={color}
              >
                <Track ticks={ticks} pct={pct}>
                  {m.showtimes.map((s) => {
                    const isChosen = s === chosen;
                    return (
                      <Bar
                        key={s}
                        left={pct(s)}
                        width={pct(s + m.durationMinutes) - pct(s)}
                        label={`${m.name}: ${formatTime(s)} → ${formatTime(s + m.durationMinutes)}${isChosen ? " (selected)" : " (not chosen)"}`}
                        onShow={setReadout}
                        className={cn(!isChosen && "border")}
                        style={
                          isChosen
                            ? { backgroundColor: color, zIndex: 1 }
                            : {
                                borderColor: `color-mix(in oklch, ${color} 55%, transparent)`,
                                backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
                              }
                        }
                      />
                    );
                  })}
                </Track>
              </Row>
            );
          })}

          <div className="grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <div className="hidden sm:block" />
            <div className="relative h-5 text-[11px] text-muted-foreground tabular-nums">
              {ticks.map((t, i) => (
                <span
                  key={t}
                  className={cn(
                    "absolute top-0 whitespace-nowrap",
                    i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                    !showTick(i, ticks.length, mobileStep) && "max-sm:hidden",
                    !showTick(i, ticks.length, desktopStep) && "sm:hidden",
                  )}
                  style={{ left: `${pct(t)}%` }}
                >
                  {formatTime(t, { dayMarker: false }).replace(":00", "")}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="min-h-5 text-sm tabular-nums" aria-live="polite">
          {readout ?? <span className="text-muted-foreground">{hint}</span>}
        </p>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <LegendItem swatch={<span className="block h-2.5 w-5 rounded-sm bg-foreground/70" />}>Movie (selected)</LegendItem>
          <LegendItem swatch={<span className="block h-2.5 w-5 rounded-sm border border-foreground/40 bg-foreground/10" />}>
            Other showtimes
          </LegendItem>
          <LegendItem swatch={<span className="hatch-buffer block h-2.5 w-5 rounded-sm border border-buffer/50" />}>
            Required buffer
          </LegendItem>
          <LegendItem swatch={<span className="block h-2.5 w-5 rounded-sm bg-wait" />}>Extra waiting</LegendItem>
        </ul>
      </CardContent>
    </Card>
  );
}

/** Show every `step`-th tick plus the last one, dropping a stepped tick that would crowd the last. */
function showTick(i: number, count: number, step: number): boolean {
  const last = count - 1;
  if (i === last) return true;
  return i % step === 0 && (step === 1 || last - i >= step);
}

function Row({
  label,
  sublabel,
  color,
  strong,
  children,
}: {
  label: string;
  sublabel: string;
  color?: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-baseline gap-2 sm:block">
        <p className={cn("flex min-w-0 items-center gap-1.5 text-sm", strong ? "font-semibold" : "font-medium")}>
          {color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
          <span className="truncate">{label}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">{sublabel}</p>
      </div>
      {children}
    </div>
  );
}

function Track({ ticks, pct, children }: { ticks: number[]; pct: (t: number) => number; children: React.ReactNode }) {
  return (
    <div className="relative h-7 rounded-md bg-muted/30">
      {ticks.map((t) => (
        <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-gridline" style={{ left: `${pct(t)}%` }} />
      ))}
      {children}
    </div>
  );
}

function Bar({
  left,
  width,
  label,
  onShow,
  className,
  style,
  children,
}: {
  left: number;
  width: number;
  label: string;
  onShow: (label: string) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    // 1px inset on each side gives the 2px surface gap between adjacent segments.
    <div
      className="absolute inset-y-1 px-px"
      style={{ left: `${left}%`, width: `${width}%`, zIndex: style?.zIndex }}
      onPointerEnter={() => onShow(label)}
      onPointerDown={() => onShow(label)}
      role="img"
      aria-label={label}
    >
      <div className={cn("flex h-full items-center justify-center rounded-[4px]", className)} style={style}>
        {children}
      </div>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {children}
    </li>
  );
}
