"use client";

import {
  ArrowDownIcon,
  ClapperboardIcon,
  DatabaseIcon,
  FolderOpenIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { colorVar } from "@/components/movie-color";
import { BufferComparison, type BufferRow } from "@/components/results/buffer-comparison";
import { Failures } from "@/components/results/failures";
import { ScheduleDetail } from "@/components/results/schedule-detail";
import { ScheduleList } from "@/components/results/schedule-list";
import { Timeline } from "@/components/results/timeline";
import { Verdict } from "@/components/results/verdict";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BUFFER_PRESETS,
  blankMovie,
  clearStorage,
  decodeShare,
  DEMOS,
  demoState,
  emptyState,
  encodeShare,
  hasSnapshot,
  loadDraft,
  loadSnapshot,
  newId,
  nextColor,
  saveDraft,
  saveSnapshot,
  type AppMovie,
  type AppState,
} from "@/lib/app-state";
import { MAX_MOVIES, solve, type Schedule } from "@/lib/scheduler";
import { MovieEditor } from "./movie-editor";
import { SetupCard } from "./setup-card";

function loadInitial(): { state: AppState; selectedId: string | null } {
  const match = /^#s=(.+)$/.exec(window.location.hash);
  if (match) {
    const shared = decodeShare(match[1]);
    if (shared) return { state: shared.state, selectedId: shared.selectedScheduleId };
  }
  return { state: loadDraft() ?? demoState(), selectedId: null };
}

export function Planner() {
  const [initial] = useState(loadInitial);
  const [state, setState] = useState<AppState>(initial.state);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Auto-save the working copy; drop a stale share hash once the user edits.
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(state), 250);
    if (state !== initial.state && window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => clearTimeout(timer);
  }, [state, initial.state]);

  // Solving is fast, but deferring keeps typing smooth on big inputs.
  const deferred = useDeferredValue(state);
  const result = useMemo(
    () =>
      solve({
        movies: deferred.movies,
        bufferMinutes: deferred.bufferMinutes,
        allowPastMidnight: deferred.allowPastMidnight,
      }),
    [deferred.movies, deferred.bufferMinutes, deferred.allowPastMidnight],
  );

  const bufferRows: BufferRow[] = useMemo(() => {
    if (result.status !== "ok" || deferred.movies.length < 2) return [];
    const buffers = [...new Set<number>([...BUFFER_PRESETS, deferred.bufferMinutes])].sort((a, b) => a - b);
    return buffers.map((buffer) => ({
      buffer,
      result: solve(
        { movies: deferred.movies, bufferMinutes: buffer, allowPastMidnight: deferred.allowPastMidnight },
        { maxSchedules: 1, analyzeOrders: false, nearMisses: false },
      ),
    }));
  }, [result.status, deferred.movies, deferred.bufferMinutes, deferred.allowPastMidnight]);

  // Every schedule the user can pick, by id.
  const scheduleIndex = useMemo(() => {
    const map = new Map<string, Schedule>();
    for (const s of result.schedules) map.set(s.id, s);
    for (const o of result.orders ?? []) if (o.best) map.set(o.best.id, o.best);
    if (result.bestPartial) map.set(result.bestPartial.id, result.bestPartial);
    return map;
  }, [result]);

  const fallback = result.optimal ?? result.bestPartial;
  const selected = (selectedId && scheduleIndex.get(selectedId)) || fallback;
  const isDefaultSelection = selected?.id === fallback?.id;

  const colorFor = useCallback(
    (id: string) => colorVar(state.movies.find((m) => m.id === id)?.color),
    [state.movies],
  );

  // ─── state updates ──────────────────────────────────────────────────────

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));
  const updateMovie = (movie: AppMovie) =>
    setState((s) => ({ ...s, movies: s.movies.map((m) => (m.id === movie.id ? movie : m)) }));
  const addMovie = () => setState((s) => ({ ...s, movies: [...s.movies, blankMovie(s.movies)] }));
  const duplicateMovie = (id: string) =>
    setState((s) => {
      const i = s.movies.findIndex((m) => m.id === id);
      const src = s.movies[i];
      const copy: AppMovie = { ...src, id: newId(), name: `${src.name} (copy)`, showtimes: [...src.showtimes], color: nextColor(s.movies) };
      return { ...s, movies: [...s.movies.slice(0, i + 1), copy, ...s.movies.slice(i + 1)] };
    });
  const deleteMovie = (id: string) => setState((s) => ({ ...s, movies: s.movies.filter((m) => m.id !== id) }));

  const replaceState = (next: AppState, message: string) => {
    setState(next);
    setSelectedId(null);
    notify(message);
  };

  const share = async () => {
    const hash = `#s=${encodeShare(state, isDefaultSelection ? null : selected?.id)}`;
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    history.replaceState(null, "", hash);
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied. It reproduces your movies, buffer and selected schedule.");
    } catch {
      notify("Link added to the address bar. Copy it from there.");
    }
  };

  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const issuesFor = (id: string) => result.issues.filter((i) => i.movieId === id);
  const bufferIssue = result.issues.find((i) => i.field === "buffer")?.message;
  const generalIssues = result.issues.filter((i) => !i.movieId && i.field === "movies" && i.level !== "info");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClapperboardIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Movie Marathon Scheduler</h1>
            <p className="text-sm text-muted-foreground">Can you watch them all in one day? Find the schedule that finishes earliest.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" onClick={share}>
            <Share2Icon /> Share
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" aria-label="Data options" />}>
              <DatabaseIcon /> <span className="max-sm:sr-only">Data</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>This browser</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => notify(saveSnapshot(state) ? "Saved. Use Load to restore it later." : "Could not save: storage unavailable.")}
                >
                  <SaveIcon /> Save
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasSnapshot()}
                  onClick={() => {
                    const saved = loadSnapshot();
                    if (saved) replaceState(saved, "Loaded your saved movies.");
                  }}
                >
                  <FolderOpenIcon /> Load saved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    clearStorage();
                    replaceState(demoState(DEMOS[0].id, state.date), "Reset: saved data cleared and the demo restored.");
                  }}
                >
                  <RotateCcwIcon /> Reset
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Example data</DropdownMenuLabel>
                {DEMOS.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={() => replaceState(demoState(d.id, state.date), `Loaded “${d.label}”.`)}>
                    <SparklesIcon />
                    <span className="grid">
                      <span>{d.label}</span>
                      <span className="text-xs text-muted-foreground">{d.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="grid gap-4" aria-label="Your movies">
          <SetupCard state={state} onChange={patch} bufferError={bufferIssue} />

          <div className="flex items-center justify-between gap-2 pt-2">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
              Movies <span className="font-normal text-muted-foreground">({state.movies.length})</span>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => replaceState({ ...emptyState(state.date), bufferMinutes: state.bufferMinutes }, "Cleared all movies.")}
            >
              <Trash2Icon /> Clear all
            </Button>
          </div>

          {state.movies.map((m, i) => (
            <MovieEditor
              key={m.id}
              movie={m}
              index={i}
              color={colorVar(m.color)}
              issues={issuesFor(m.id)}
              onChange={updateMovie}
              onDuplicate={() => duplicateMovie(m.id)}
              onDelete={() => deleteMovie(m.id)}
              canDuplicate={state.movies.length < MAX_MOVIES}
            />
          ))}

          {generalIssues.map((i, k) => (
            <p key={k} className="text-sm text-bad-ink">
              {i.message}
            </p>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addMovie} disabled={state.movies.length >= MAX_MOVIES} className="flex-1">
              <PlusIcon /> Add movie
            </Button>
            <Button onClick={scrollToResults} className="flex-1 lg:hidden">
              <ArrowDownIcon /> Calculate schedule
            </Button>
          </div>
        </section>

        <section ref={resultsRef} className="grid scroll-mt-4 gap-4" aria-label="Results" aria-live="polite">
          <Verdict result={result} date={state.date} colorFor={colorFor} />

          {selected && result.movies.length > 1 && (
            <ScheduleDetail
              schedule={selected}
              isOptimal={selected.id === result.optimal?.id}
              totalMovies={result.movies.length}
              bufferMinutes={result.bufferMinutes}
              colorFor={colorFor}
              onResetSelection={isDefaultSelection ? undefined : () => setSelectedId(null)}
            />
          )}

          {result.status === "ok" && result.movies.length > 1 && (
            <Timeline schedule={selected ?? null} movies={result.movies} bufferMinutes={result.bufferMinutes} colorFor={colorFor} />
          )}

          {bufferRows.length > 0 && (
            <BufferComparison
              rows={bufferRows}
              current={state.bufferMinutes}
              movieCount={result.movies.length}
              onPick={(b) => patch({ bufferMinutes: b })}
            />
          )}

          {result.allFeasible && result.movies.length > 1 && (
            <ScheduleList result={result} selectedId={selected?.id ?? null} colorFor={colorFor} onSelect={setSelectedId} />
          )}

          <Failures result={result} />

          {result.status === "ok" && result.movies.length > 1 && (
            <p className="px-1 text-xs text-muted-foreground">
              Search: {result.stats.nodesExplored.toLocaleString()} nodes explored and {result.stats.dpStates.toLocaleString()} DP
              states, versus {formatBig(result.stats.bruteForceCombinations)} combinations for naive brute force
              {result.stats.ordersEvaluated > 0 && <> · {result.stats.ordersEvaluated} movie orders analysed</>}.
            </p>
          )}
        </section>
      </div>

      <div
        role="status"
        className={`pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}
      >
        {toast && <p className="rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">{toast}</p>}
      </div>
    </div>
  );
}

function formatBig(n: number): string {
  if (n < 1e6) return n.toLocaleString();
  const exp = Math.floor(Math.log10(n));
  return `${(n / 10 ** exp).toFixed(1)} × 10^${exp}`;
}
