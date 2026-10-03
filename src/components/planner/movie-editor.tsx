"use client";

import { CopyIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { MovieSwatch } from "@/components/movie-color";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppMovie } from "@/lib/app-state";
import { formatTime, parseTime, toHHMM, type ValidationIssue } from "@/lib/scheduler";
import { cn } from "@/lib/utils";

interface MovieEditorProps {
  movie: AppMovie;
  index: number;
  color: string;
  issues: ValidationIssue[];
  onChange: (movie: AppMovie) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDuplicate: boolean;
}

/** Finds time-like tokens in free text: "10am, 1:30 PM; 17:15 9:45pm". */
const TIME_TOKEN = /\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?/gi;

export function MovieEditor({ movie, index, color, issues, onChange, onDuplicate, onDelete, canDuplicate }: MovieEditorProps) {
  const uid = useId();
  const [timeDraft, setTimeDraft] = useState("");
  const [bulkDraft, setBulkDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const hours = Math.floor((movie.durationMinutes || 0) / 60);
  const minutes = (movie.durationMinutes || 0) % 60;
  const sorted = [...movie.showtimes].sort((a, b) => (parseTime(a) ?? 0) - (parseTime(b) ?? 0));
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const hasError = (field: ValidationIssue["field"]) => errors.some((i) => i.field === field);

  const addTimes = (raw: string[]) => {
    const existing = new Set(movie.showtimes.map((s) => parseTime(s)));
    const added: string[] = [];
    let duplicates = 0;
    let invalid = 0;
    for (const token of raw) {
      const t = parseTime(token);
      if (t === null) invalid++;
      else if (existing.has(t)) duplicates++;
      else {
        existing.add(t);
        added.push(toHHMM(t));
      }
    }
    if (added.length) onChange({ ...movie, showtimes: [...movie.showtimes, ...added] });
    const parts = [
      added.length ? `Added ${added.length}` : null,
      duplicates ? `${duplicates} already listed` : null,
      invalid ? `${invalid} not recognised` : null,
    ].filter(Boolean);
    setNote(parts.length && (duplicates || invalid || added.length > 1) ? parts.join(" · ") : null);
    return added.length > 0 || duplicates > 0;
  };

  const addSingle = () => {
    if (!timeDraft) return;
    if (addTimes([timeDraft])) setTimeDraft("");
  };

  const addBulk = () => {
    const tokens = bulkDraft.match(TIME_TOKEN) ?? [];
    if (tokens.length === 0) {
      setNote("No times found. Try “10:00 AM, 1:30 PM, 17:15”.");
      return;
    }
    addTimes(tokens.map((t) => t.replace(/\./g, "")));
    setBulkDraft("");
  };

  const setDuration = (h: number, m: number) =>
    onChange({ ...movie, durationMinutes: Math.max(0, Math.round(h)) * 60 + Math.max(0, Math.round(m)) });

  return (
    <Card size="sm" className={cn(errors.length > 0 && "ring-bad/40")}>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2">
          <MovieSwatch color={color} className="size-3" />
          <Label htmlFor={`${uid}-name`} className="sr-only">
            Movie {index + 1} name
          </Label>
          <Input
            id={`${uid}-name`}
            value={movie.name}
            placeholder={`Movie ${index + 1} name`}
            aria-invalid={hasError("name") || undefined}
            onChange={(e) => onChange({ ...movie, name: e.target.value })}
            className="h-9 flex-1 text-base font-medium"
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Duplicate movie" onClick={onDuplicate} disabled={!canDuplicate}>
                  <CopyIcon />
                </Button>
              }
            />
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Delete movie" onClick={onDelete}>
                  <Trash2Icon />
                </Button>
              }
            />
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium" id={`${uid}-dur`}>
            Duration
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby={`${uid}-dur`}>
            <div className="relative w-20">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={24}
                aria-label="Hours"
                aria-invalid={hasError("duration") || undefined}
                value={hours}
                onChange={(e) => setDuration(Number(e.target.value), minutes)}
                className="no-spinner pr-6 tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">h</span>
            </div>
            <div className="relative w-20">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={5}
                aria-label="Minutes"
                aria-invalid={hasError("duration") || undefined}
                value={minutes}
                onChange={(e) => setDuration(hours, Number(e.target.value))}
                className="no-spinner pr-6 tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">m</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">= {movie.durationMinutes || 0} min</span>
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">
            Showtimes <span className="font-normal text-muted-foreground">({sorted.length})</span>
          </span>

          {sorted.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Showtimes">
              {sorted.map((s) => {
                const t = parseTime(s);
                const end = t === null ? null : t + (movie.durationMinutes || 0);
                return (
                  <li key={s}>
                    <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/40 pr-0.5 pl-2 text-sm tabular-nums">
                      <span title={end !== null && movie.durationMinutes > 0 ? `Ends ${formatTime(end)}` : undefined}>
                        {t === null ? s : formatTime(t)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChange({ ...movie, showtimes: movie.showtimes.filter((x) => x !== s) })}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${t === null ? s : formatTime(t)}`}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No showtimes yet.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addSingle();
              }}
            >
              <Input
                type="time"
                aria-label="New showtime"
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                className="w-32 tabular-nums"
              />
              <Button type="submit" variant="outline" disabled={!timeDraft}>
                <PlusIcon /> Add
              </Button>
            </form>
            <form
              className="flex min-w-[min(100%,16rem)] flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addBulk();
              }}
            >
              <Input
                aria-label="Paste several showtimes"
                placeholder="Paste: 10am, 1:30pm, 17:15"
                value={bulkDraft}
                onChange={(e) => setBulkDraft(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="outline" disabled={!bulkDraft.trim()}>
                Add all
              </Button>
            </form>
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>

        {(errors.length > 0 || warnings.length > 0) && (
          <ul className="grid gap-1 text-xs">
            {errors.map((i, k) => (
              <li key={`e${k}`} className="text-bad-ink">
                {i.message}
              </li>
            ))}
            {warnings.map((i, k) => (
              <li key={`w${k}`} className="text-muted-foreground">
                ⚠ {i.message}
              </li>
            ))}
          </ul>
        )}

      </CardContent>
    </Card>
  );
}
