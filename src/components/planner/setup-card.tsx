"use client";

import { CalendarIcon, TimerIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BUFFER_PRESETS, type AppState } from "@/lib/app-state";
import { cn } from "@/lib/utils";

interface SetupCardProps {
  state: AppState;
  onChange: (patch: Partial<AppState>) => void;
  bufferError?: string;
}

export function SetupCard({ state, onChange, bufferError }: SetupCardProps) {
  const isPreset = (BUFFER_PRESETS as readonly number[]).includes(state.bufferMinutes);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
          Day &amp; buffer
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="date" className="flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-muted-foreground" /> Date
          </Label>
          <Input
            id="date"
            type="date"
            value={state.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="w-full"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="buffer-custom" className="flex items-center gap-1.5">
            <TimerIcon className="size-3.5 text-muted-foreground" /> Buffer between movies
          </Label>
          <div className="flex gap-1.5" role="group" aria-label="Buffer presets">
            {BUFFER_PRESETS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={state.bufferMinutes === b}
                onClick={() => onChange({ bufferMinutes: b })}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-lg border text-sm font-medium tabular-nums transition-colors",
                  state.bufferMinutes === b
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted dark:bg-input/30",
                )}
              >
                {b}m
              </button>
            ))}
            <div className="relative w-20 shrink-0">
              <Input
                id="buffer-custom"
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                aria-label="Custom buffer in minutes"
                aria-invalid={bufferError ? true : undefined}
                value={Number.isFinite(state.bufferMinutes) ? state.bufferMinutes : ""}
                onChange={(e) => onChange({ bufferMinutes: e.target.value === "" ? NaN : Number(e.target.value) })}
                className={cn("no-spinner w-full pr-7 tabular-nums", !isPreset && "border-primary ring-1 ring-primary")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                m
              </span>
            </div>
          </div>
          {bufferError && <p className="text-xs text-bad-ink">{bufferError}</p>}
        </div>

        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div className="grid gap-0.5">
            <Label htmlFor="midnight">Allow movies that end after midnight</Label>
            <p className="text-xs text-muted-foreground">
              When off, late showtimes that would finish the next day are ignored.
            </p>
          </div>
          <Switch
            id="midnight"
            checked={state.allowPastMidnight}
            onCheckedChange={(checked) => onChange({ allowPastMidnight: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
