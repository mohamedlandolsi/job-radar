import type { Run } from "@/lib/radar";
import { timeAgo } from "@/lib/format";
import { FUNNEL_KEYS, FUNNEL_SHORT, formatDuration, providerSummary, radarTime } from "@/lib/run-format";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "text-state-approved bg-state-approved-tint" },
  running: { label: "Running", cls: "text-state-pending bg-state-pending-tint" },
  failed: { label: "Failed", cls: "text-danger bg-danger-tint" },
};
const TRIGGER: Record<string, string> = { schedule: "Schedule", requested: "Requested", manual: "Manual" };

const GRID = "lg:grid lg:grid-cols-[7.5rem_5.5rem_5.5rem_minmax(0,7rem)_5.5rem_minmax(0,1fr)_minmax(0,11rem)_3.5rem] lg:gap-3 lg:items-start";

function Funnel({ f }: { f: Run["funnel"] }) {
  const steps = FUNNEL_KEYS.filter((k) => typeof f?.[k] === "number");
  if (!steps.length) return <span className="text-ink-3">no funnel</span>;
  return (
    <span className="tabular" title={steps.map((k) => `${FUNNEL_SHORT[k]} ${f[k]}`).join(", ")}>
      {steps.map((k, i) => (
        <span key={k} className="whitespace-nowrap">
          {i > 0 ? <span className="text-ink-3"> → </span> : null}
          <span className={cn(k === "matches" && "font-semibold")}>{f[k]}</span>
          <span className="text-ink-3 lg:sr-only"> {FUNNEL_SHORT[k]}</span>
        </span>
      ))}
    </span>
  );
}

function Providers({ p }: { p: string | null }) {
  const items = providerSummary(p);
  if (!items.length) return <span className="text-ink-3">no LLM calls</span>;
  return (
    <span className="flex flex-wrap gap-x-2">
      {items.map((x) => (
        <span key={x.label} className={cn("whitespace-nowrap", x.kind === "failed" && "font-medium text-danger", x.kind === "deferred" && "text-ink-3")}>
          {x.label} <span className="tabular">{x.count}</span>
        </span>
      ))}
    </span>
  );
}

// The last runs, newest first: cards on phones, a table from lg up. errors_sample opens on demand.
export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) return <p className="rounded-lg border bg-card p-4 text-[0.9375rem] text-ink-3">No runs yet.</p>;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className={cn("hidden border-b px-3 py-2 text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase", GRID)}>
        <span>Started</span>
        <span>Trigger</span>
        <span>Status</span>
        <span>Rev</span>
        <span>Duration</span>
        <span>Funnel: fetched → gate A → new → detail → gate B → LLM → matches</span>
        <span>Providers</span>
        <span className="text-right">Failed</span>
      </div>
      <ul className="divide-y">
        {runs.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, cls: "bg-secondary text-muted-foreground" };
          const errors = (r.errors_sample ?? "").split(" | ").map((s) => s.trim()).filter(Boolean);
          return (
            <li key={r.run_id} data-run={r.run_id} className="space-y-2 px-3 py-3 text-[0.8125rem]">
              <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", GRID)}>
                <span title={r.started_at}>
                  <span className="font-medium text-foreground">#{r.run_id}</span> <span className="text-muted-foreground">{radarTime(r.started_at)}</span>
                  <span className="block text-[0.75rem] text-ink-3">{timeAgo(r.started_at)}</span>
                </span>
                <span className="text-muted-foreground">{TRIGGER[r.trigger] ?? r.trigger}</span>
                <span>
                  <span className={cn("inline-flex h-6 items-center rounded px-2 font-medium", st.cls)}>{st.label}</span>
                </span>
                <span className="font-mono text-[0.75rem] [overflow-wrap:anywhere]">{r.config_rev ?? "-"}</span>
                <span className="tabular text-muted-foreground">{formatDuration(r.duration_seconds)}</span>
                <span className="basis-full lg:basis-auto">
                  <Funnel f={r.funnel} />
                </span>
                <span className="basis-full lg:basis-auto">
                  <Providers p={r.providers} />
                </span>
                <span className={cn("tabular lg:text-right", (r.failures ?? 0) > 0 ? "font-medium text-danger" : "text-ink-3")}>
                  {r.failures ?? 0}
                  <span className="lg:sr-only"> failed LLM {r.failures === 1 ? "item" : "items"}</span>
                </span>
              </div>
              {r.warnings ? (
                <p className="font-mono text-[0.75rem] text-state-pending [overflow-wrap:anywhere]">
                  <span className="font-sans font-medium">Warnings: </span>
                  {r.warnings}
                </p>
              ) : null}
              {errors.length ? (
                <details className="group">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-danger underline-offset-4 hover:underline sm:min-h-0">
                    {errors.length} {errors.length === 1 ? "error" : "errors"} in the sample
                  </summary>
                  <ul className="mt-1 space-y-1 rounded bg-secondary p-2 font-mono text-[0.75rem] text-muted-foreground">
                    {errors.map((e, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {e}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
