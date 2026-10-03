import { CheckIcon, StarIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import type { ColorLookup } from "@/components/movie-color";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatTime, validateSchedule, type Schedule } from "@/lib/scheduler";

interface ScheduleDetailProps {
  schedule: Schedule;
  isOptimal: boolean;
  totalMovies: number;
  bufferMinutes: number;
  colorFor: ColorLookup;
  onResetSelection?: () => void;
}

export function ScheduleDetail({ schedule, isOptimal, totalMovies, bufferMinutes, colorFor, onResetSelection }: ScheduleDetailProps) {
  const partial = schedule.entries.length < totalMovies;
  const violations = validateSchedule(schedule.entries, bufferMinutes);
  const gaps = schedule.entries.length - 1;

  const title = partial
    ? `Best partial schedule (${schedule.entries.length} of ${totalMovies})`
    : isOptimal
      ? "Earliest schedule"
      : "Selected schedule";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {isOptimal && !partial && (
            <Badge>
              <StarIcon data-icon="inline-start" /> Optimal
            </Badge>
          )}
        </CardTitle>
        {onResetSelection && (
          <Button variant="outline" size="sm" onClick={onResetSelection}>
            <Undo2Icon /> Back to optimal
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        <ol className="grid">
          {schedule.entries.map((e, i) => (
            <li key={`${e.movieId}@${e.start}`}>
              {e.gapBefore !== null && (
                <div className="ml-[0.6875rem] flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-dashed py-2 pl-5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="hatch-buffer inline-block h-2.5 w-5 rounded-sm" aria-hidden />
                    Buffer {bufferMinutes}m
                  </span>
                  {e.extraWaitBefore! > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-5 rounded-sm bg-wait" aria-hidden />
                      +{formatDuration(e.extraWaitBefore!)} extra wait
                    </span>
                  )}
                  {e.extraWaitBefore! < 0 && (
                    <span className="inline-flex items-center gap-1 text-bad-ink">
                      <TriangleAlertIcon className="size-3" /> {formatDuration(-e.extraWaitBefore!)} short of the buffer
                    </span>
                  )}
                  <span className="tabular-nums">gap {formatDuration(e.gapBefore)}</span>
                </div>
              )}
              <div className="flex items-start gap-3">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold"
                  style={{ borderColor: colorFor(e.movieId) }}
                >
                  {i + 1}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{e.movieName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatTime(e.start)} → {formatTime(e.end)} · {formatDuration(e.durationMinutes)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3 sm:gap-y-2">
          <Row label="Start" value={formatTime(schedule.startTime)} />
          <Row label="Finish" value={formatTime(schedule.endTime)} />
          <Row label="Total duration" value={formatDuration(schedule.totalElapsedMinutes)} />
          <Row label="Movie time" value={formatDuration(schedule.totalMovieMinutes)} />
          <Row label="Waiting time" value={formatDuration(schedule.totalWaitingMinutes)} />
          <Row label="Buffer" value={gaps > 0 ? `${bufferMinutes}m × ${gaps}` : "—"} />
          <Row label="Extra waiting" value={formatDuration(schedule.extraWaitingMinutes)} />
        </dl>

        {violations.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckIcon className="size-3.5 text-good" /> Verified: every movie starts at least {bufferMinutes} min after the
            previous one ends.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-bad-ink">
            <TriangleAlertIcon className="size-3.5" /> This schedule breaks the buffer rule.
          </p>
        )}
        {schedule.endsAfterMidnight && (
          <p className="text-xs text-muted-foreground">(+1) means the next day: this schedule finishes after midnight.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}

