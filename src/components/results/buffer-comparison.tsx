import { CheckIcon, XIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatTime, type SolveResult } from "@/lib/scheduler";
import { cn } from "@/lib/utils";

export interface BufferRow {
  buffer: number;
  result: SolveResult;
}

interface BufferComparisonProps {
  rows: BufferRow[];
  current: number;
  movieCount: number;
  onPick: (buffer: number) => void;
}

/** Same movies, re-solved by the engine for each buffer. */
export function BufferComparison({ rows, current, movieCount, onPick }: BufferComparisonProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Buffer comparison</CardTitle>
        <CardDescription>Each row is a full re-run of the scheduler with that buffer. Click a row to use it.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Buffer</th>
              <th className="py-2 pr-3 font-medium">All movies?</th>
              <th className="py-2 pr-3 font-medium">Earliest finish</th>
              <th className="py-2 pr-3 font-medium max-sm:hidden">Day length</th>
              <th className="py-2 text-right font-medium">Combinations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ buffer, result }) => {
              const ok = result.allFeasible;
              const active = buffer === current;
              return (
                <tr
                  key={buffer}
                  onClick={() => onPick(buffer)}
                  className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/50", active && "bg-muted/60 font-medium")}
                  aria-current={active || undefined}
                >
                  <td className="py-2 pr-3 tabular-nums">
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(buffer);
                      }}
                    >
                      {buffer} min{active && <span className="ml-1.5 text-xs text-muted-foreground">(current)</span>}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    {ok ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckIcon className="size-4 text-good" /> Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <XIcon className="size-4 text-bad" /> No
                        <span className="text-xs text-muted-foreground">
                          ({result.maxWatchable}/{movieCount})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{ok && result.optimal ? formatTime(result.optimal.endTime) : "—"}</td>
                  <td className="py-2 pr-3 tabular-nums max-sm:hidden">
                    {ok && result.optimal ? formatDuration(result.optimal.totalElapsedMinutes) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{result.feasibleCount.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
