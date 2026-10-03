"use client";

import { ArrowRightIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { MovieSwatch, type ColorLookup } from "@/components/movie-color";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  factorial,
  formatDuration,
  formatTime,
  sortLabels,
  sortSchedules,
  type Schedule,
  type SolveResult,
  type SortKey,
} from "@/lib/scheduler";
import { cn } from "@/lib/utils";

interface ScheduleListProps {
  result: SolveResult;
  selectedId: string | null;
  colorFor: ColorLookup;
  onSelect: (id: string) => void;
}

const PAGE = 20;

export function ScheduleList({ result, selectedId, colorFor, onSelect }: ScheduleListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("finish");
  const [limit, setLimit] = useState(PAGE);
  const sorted = useMemo(() => sortSchedules(result.schedules, sortKey), [result.schedules, sortKey]);
  const optimalId = result.optimal?.id;
  const feasibleOrders = result.orders?.filter((o) => o.feasible) ?? [];
  const n = result.movies.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All feasible schedules</CardTitle>
        <CardDescription>
          {result.feasibleCount.toLocaleString()} valid combination{result.feasibleCount === 1 ? "" : "s"}
          {result.orders && <> across {feasibleOrders.length} of {factorial(n)} movie orders</>}. Click one to see it on the
          timeline.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="orders">
          <TabsList className="mb-3">
            <TabsTrigger value="orders">By movie order</TabsTrigger>
            <TabsTrigger value="all">Every combination</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            {result.orders === null ? (
              <p className="text-sm text-muted-foreground">
                With {n} movies there are {factorial(n).toLocaleString()} orders, too many to list one by one. Use “Every
                combination”, which is searched with pruning instead.
              </p>
            ) : (
              <ol className="grid gap-2">
                {feasibleOrders.map((o, i) => (
                  <ScheduleRow
                    key={o.order.join()}
                    rank={i + 1}
                    schedule={o.best!}
                    optimal={o.best!.id === optimalId}
                    selected={o.best!.id === selectedId}
                    colorFor={colorFor}
                    onSelect={onSelect}
                    extra={`${o.combinations} showtime combination${o.combinations === 1 ? "" : "s"}`}
                  />
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="all">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {result.truncated
                  ? `Showing the ${result.schedules.length.toLocaleString()} earliest-finishing of ${result.feasibleCount.toLocaleString()}; sorting applies within these.`
                  : `${result.schedules.length} schedules`}
              </p>
              <Select value={sortKey} onValueChange={(v) => v && setSortKey(v as SortKey)}>
                <SelectTrigger size="sm" aria-label="Sort schedules">
                  <SelectValue>{(v: SortKey) => sortLabels[v]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {sortLabels[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ol className="grid gap-2">
              {sorted.slice(0, limit).map((s, i) => (
                <ScheduleRow
                  key={s.id}
                  rank={i + 1}
                  schedule={s}
                  optimal={s.id === optimalId}
                  selected={s.id === selectedId}
                  colorFor={colorFor}
                  onSelect={onSelect}
                  showTimes
                />
              ))}
            </ol>
            {sorted.length > limit && (
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({(sorted.length - limit).toLocaleString()} left)
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ScheduleRow({
  rank,
  schedule,
  optimal,
  selected,
  colorFor,
  onSelect,
  extra,
  showTimes,
}: {
  rank: number;
  schedule: Schedule;
  optimal: boolean;
  selected: boolean;
  colorFor: ColorLookup;
  onSelect: (id: string) => void;
  extra?: string;
  showTimes?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(schedule.id)}
        aria-pressed={selected}
        className={cn(
          "grid w-full gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
          selected && "border-primary bg-muted/60",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-7 text-xs font-medium text-muted-foreground tabular-nums">#{rank}</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
            {schedule.entries.map((e, i) => (
              <span key={e.movieId} className="inline-flex items-center gap-1.5">
                {i > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" />}
                <MovieSwatch color={colorFor(e.movieId)} />
                {e.movieName}
                {showTimes && <span className="font-normal text-muted-foreground tabular-nums">{formatTime(e.start)}</span>}
              </span>
            ))}
          </span>
          {optimal && (
            <Badge>
              <StarIcon data-icon="inline-start" /> Optimal
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-9 text-xs text-muted-foreground tabular-nums">
          <span>
            {formatTime(schedule.startTime)} → <span className="font-medium text-foreground">{formatTime(schedule.endTime)}</span>
          </span>
          <span>Total {formatDuration(schedule.totalElapsedMinutes)}</span>
          <span>Waiting {formatDuration(schedule.totalWaitingMinutes)}</span>
          {extra && <span>{extra}</span>}
        </div>
      </button>
    </li>
  );
}
