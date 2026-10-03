import { CheckCircle2Icon, InfoIcon, XCircleIcon } from "lucide-react";
import { MovieSwatch, type ColorLookup } from "@/components/movie-color";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/app-state";
import { factorial, formatDuration, formatTime, type SolveResult } from "@/lib/scheduler";

interface VerdictProps {
  result: SolveResult;
  date: string;
  colorFor: ColorLookup;
}

export function Verdict({ result, date, colorFor }: VerdictProps) {
  const n = result.movies.length;
  const dateLabel = formatDate(date);
  const bufferLabel = `${result.bufferMinutes}-minute buffer`;

  if (result.status === "invalid") {
    const errors = result.issues.filter((i) => i.level === "error");
    return (
      <Card>
        <CardContent className="flex gap-3">
          <InfoIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="grid gap-2">
            <p className="font-medium">Finish entering your movies to see the schedule</p>
            <ul className="grid list-disc gap-1 pl-4 text-sm text-muted-foreground">
              {errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (n === 1) {
    const m = result.movies[0];
    return (
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-2">
            <InfoIcon className="size-5 text-muted-foreground" />
            <p className="font-medium">Only one movie — every showtime works</p>
          </div>
          <p className="text-sm text-muted-foreground">Add another movie to plan a marathon. Showtimes for {m.name}:</p>
          <ul className="grid gap-1 text-sm tabular-nums sm:grid-cols-2">
            {m.showtimes.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <MovieSwatch color={colorFor(m.id)} />
                {formatTime(s)} → {formatTime(s + m.durationMinutes)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  if (result.allFeasible && result.optimal) {
    const o = result.optimal;
    const feasibleOrders = result.orders?.filter((x) => x.feasible).length;
    return (
      <Card className="ring-good/40">
        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2Icon className="mt-0.5 size-7 shrink-0 text-good" aria-hidden />
            <div className="grid gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Can I watch all movies?</p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Yes <span className="sr-only">— all movies fit</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                {n}/{n} movies · {bufferLabel}
                {dateLabel && <> · {dateLabel}</>}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Done by" value={formatTime(o.endTime)} />
            <Stat label="Start at" value={formatTime(o.startTime)} />
            <Stat label="Day length" value={formatDuration(o.totalElapsedMinutes)} />
            <Stat
              label="Valid combinations"
              value={result.feasibleCount.toLocaleString()}
              hint={feasibleOrders !== undefined ? `${feasibleOrders} of ${factorial(n)} orders work` : undefined}
            />
          </dl>
        </CardContent>
      </Card>
    );
  }

  return <Infeasible result={result} bufferLabel={bufferLabel} dateLabel={dateLabel} colorFor={colorFor} />;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Infeasible({
  result,
  bufferLabel,
  dateLabel,
  colorFor,
}: {
  result: SolveResult;
  bufferLabel: string;
  dateLabel: string;
  colorFor: ColorLookup;
}) {
  const n = result.movies.length;

  // Strongest explanation: two movies that cannot share the day in either order.
  const blockedPairs: { a: string; b: string; ab: string; ba: string }[] = [];
  for (const p of result.pairs) {
    if (p.feasible || p.fromId > p.toId) continue;
    const reverse = result.pairs.find((q) => q.fromId === p.toId && q.toId === p.fromId);
    if (reverse && !reverse.feasible) {
      blockedPairs.push({ a: p.fromName, b: p.toName, ab: pairReason(p, result.bufferMinutes), ba: pairReason(reverse, result.bufferMinutes) });
    }
  }
  const orderFailures = (result.orders ?? []).filter((o) => o.failure).slice(0, 3);
  const partial = result.bestPartial;

  return (
    <Card className="ring-bad/40">
      <CardContent className="grid gap-4">
        <div className="flex items-start gap-3">
          <XCircleIcon className="mt-0.5 size-7 shrink-0 text-bad" aria-hidden />
          <div className="grid gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Can I watch all movies?</p>
            <h2 className="text-2xl font-semibold tracking-tight">No</h2>
            <p className="text-sm">
              It is not possible to watch all {n} movies with a {bufferLabel} on this day.
            </p>
            <p className="text-sm text-muted-foreground">
              {result.maxWatchable}/{n} movies can be watched{dateLabel && <> · {dateLabel}</>}
            </p>
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <p className="font-medium">The bottleneck</p>
          {blockedPairs.length > 0 ? (
            <ul className="grid gap-2">
              {blockedPairs.map((bp, i) => (
                <li key={i} className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="font-medium">
                    {bp.a} and {bp.b} can never both be watched.
                  </p>
                  <p className="text-muted-foreground">{bp.ab}</p>
                  <p className="text-muted-foreground">{bp.ba}</p>
                </li>
              ))}
            </ul>
          ) : orderFailures.length > 0 ? (
            <ul className="grid gap-2">
              {orderFailures.map((o) => (
                <li key={o.order.join()} className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="font-medium">{o.names.join(" → ")}</p>
                  <p className="text-muted-foreground">{o.failure!.message}</p>
                </li>
              ))}
              {(result.orders?.length ?? 0) > orderFailures.length && (
                <li className="text-muted-foreground">Every other order fails too. See “Why other combinations fail” below.</li>
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground">No order of these movies fits the showtimes with this buffer.</p>
          )}
        </div>

        {partial && (
          <div className="grid gap-2 rounded-lg border px-3 py-3 text-sm">
            <p className="font-medium">
              Best you can do: {partial.entries.length} of {n} movies, done by {formatTime(partial.endTime)}
            </p>
            <ol className="grid gap-1">
              {partial.entries.map((e) => (
                <li key={e.movieId} className="flex items-center gap-2 tabular-nums">
                  <MovieSwatch color={colorFor(e.movieId)} />
                  <span className="font-medium">{e.movieName}</span>
                  <span className="text-muted-foreground">
                    {formatTime(e.start)} → {formatTime(e.end)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function pairReason(p: SolveResult["pairs"][number], buffer: number): string {
  return (
    `${p.fromName} → ${p.toName}: ${p.fromName} ends ${formatTime(p.earliestEnd)} at the earliest, ` +
    `so ${p.toName} would need a showtime at or after ${formatTime(p.requiredStart)}` +
    (buffer > 0 ? ` (${buffer}-min buffer)` : "") +
    `, but its latest is ${formatTime(p.latestShowtime)}.`
  );
}
