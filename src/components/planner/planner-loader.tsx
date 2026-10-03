"use client";

import dynamic from "next/dynamic";

/**
 * The planner reads localStorage and the URL hash during initialisation, so it is
 * rendered on the client only. The skeleton keeps the layout stable while it loads.
 */
const Planner = dynamic(() => import("./planner").then((m) => m.Planner), {
  ssr: false,
  loading: () => <PlannerSkeleton />,
});

export function PlannerLoader() {
  return <Planner />;
}

function PlannerSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading planner">
      <div className="mb-6 h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="h-[32rem] animate-pulse rounded-xl bg-muted" />
        <div className="h-[32rem] animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
