"use client";

import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDuration, formatTime, type OrderAnalysis, type SolveResult } from "@/lib/scheduler";

interface FailuresProps {
  result: SolveResult;
}

/** Transparency: why each impossible order fails, and which combinations only look possible. */
export function Failures({ result }: FailuresProps) {
  const failedOrders = (result.orders ?? []).filter((o) => !o.feasible);
  const blockedPairs = result.pairs.filter((p) => !p.feasible);
  const nothing = failedOrders.length === 0 && result.nearMisses.length === 0 && blockedPairs.length === 0;
  if (result.status !== "ok" || result.movies.length < 2 || nothing) return null;

  return (
    <Card>
      <Collapsible>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
            <div className="grid gap-1">
              <CardTitle className="text-base">Why other combinations fail</CardTitle>
              <CardDescription>
                {failedOrders.length > 0 && `${failedOrders.length} impossible order${failedOrders.length === 1 ? "" : "s"}`}
                {failedOrders.length > 0 && result.nearMisses.length > 0 && " · "}
                {result.nearMisses.length > 0 &&
                  `${result.nearMisses.length} near miss${result.nearMisses.length === 1 ? "" : "es"} that break the buffer`}
                {failedOrders.length === 0 && result.nearMisses.length === 0 && "Movie pairs that cannot follow each other"}
              </CardDescription>
            </div>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-6 pt-4">
            {failedOrders.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Impossible movie orders</h3>
                <p className="text-xs text-muted-foreground">
                  Each order is checked with the earliest possible showtime for every movie. That is the best case, so if
                  it fails, no showtime choice can rescue the order.
                </p>
                <ul className="grid gap-2">
                  {failedOrders.map((o) => (
                    <OrderFailureItem key={o.order.join()} order={o} buffer={result.bufferMinutes} />
                  ))}
                </ul>
              </section>
            )}

            {result.nearMisses.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Looks possible, but breaks the buffer</h3>
                <p className="text-xs text-muted-foreground">
                  These combinations have no overlapping movies, but at least one gap is shorter than {result.bufferMinutes}{" "}
                  minutes.
                </p>
                <ul className="grid gap-2">
                  {result.nearMisses.map(({ schedule, violations }) => (
                    <li key={schedule.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive">Invalid</Badge>
                        <span className="font-medium">
                          {schedule.entries.map((e) => `${e.movieName} ${formatTime(e.start)}`).join(" → ")}
                        </span>
                      </div>
                      <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                        {violations.map((v, i) => (
                          <li key={i}>
                            {v.fromMovieName} ends {formatTime(v.previousEnd)}, {v.toMovieName} starts {formatTime(v.actualStart)}{" "}
                            — needs {formatTime(v.requiredStart)}, short by{" "}
                            <span className="font-medium text-bad-ink">{formatDuration(v.violationMinutes)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {blockedPairs.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Movies that can never follow each other</h3>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {blockedPairs.map((p) => (
                    <li key={`${p.fromId}-${p.toId}`}>
                      <span className="font-medium text-foreground">
                        {p.fromName} → {p.toName}
                      </span>{" "}
                      is impossible: {p.toName} has no showtime at least {result.bufferMinutes} minutes after {p.fromName} finishes
                      (earliest finish {formatTime(p.earliestEnd)}, latest {p.toName} showtime {formatTime(p.latestShowtime)}).
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function OrderFailureItem({ order, buffer }: { order: OrderAnalysis; buffer: number }) {
  const f = order.failure!;
  return (
    <li className="rounded-lg border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Invalid</Badge>
        <span className="font-medium">{order.names.join(" → ")}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        <Fact label={`${f.previousMovieName} ends`} value={formatTime(f.previousEnd)} />
        <Fact label="Required buffer" value={`${buffer} min`} />
        <Fact label="Required start" value={formatTime(f.requiredStart)} />
        <Fact label={`Latest ${f.movieName}`} value={formatTime(f.latestShowtime)} />
        <Fact label="Short by" value={formatDuration(f.shortByMinutes)} bad />
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{f.message}</p>
    </li>
  );
}

function Fact({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className={bad ? "font-medium text-bad-ink tabular-nums" : "font-medium tabular-nums"}>{value}</dd>
    </div>
  );
}
