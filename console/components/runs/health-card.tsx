import { TriangleAlert } from "lucide-react";
import type { Health } from "@/lib/radar";
import { healthState } from "@/lib/health";
import { formatAge } from "@/lib/format";
import { FUNNEL_KEYS, FUNNEL_SHORT, radarTime } from "@/lib/run-format";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<string, string> = { completed: "Completed", running: "Running", failed: "Failed" };

function Item({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2 lg:col-span-4")}>
      <dt className="text-[0.75rem] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

// v_jr_health as a card. Red (with the reason) under the same rule as the header chip.
export function HealthCard({ h, children }: { h: Health | null; children: React.ReactNode }) {
  const state = healthState(h);
  const funnel = h?.last_funnel ?? null;
  const steps = funnel ? FUNNEL_KEYS.filter((k) => typeof funnel[k] === "number") : [];
  return (
    <div className={cn("space-y-4 rounded-lg border bg-card p-4", state.red && "border-danger")}>
      {state.red ? (
        <p className="flex items-center gap-2 font-medium text-danger" role="status">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {state.reason === "no_run"
            ? "No run recorded yet."
            : state.reason === "failed"
              ? "The last run failed. Check its warnings and errors below."
              : `The last run was ${formatAge(h!.age_seconds!)}. Is the laptop or n8n off?`}
        </p>
      ) : null}
      {h && h.last_run_id !== null ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <Item label="Last run">
            #{h.last_run_id} · <span className={cn(h.last_status === "failed" && "font-medium text-danger")}>{STATUS_TEXT[h.last_status ?? ""] ?? h.last_status}</span>
          </Item>
          <Item label="Started">
            <span title={h.last_started_at ?? undefined}>{h.last_started_at ? radarTime(h.last_started_at) : "-"}</span>
          </Item>
          <Item label={h.last_finished_at ? "Finished" : "Age"}>
            <span className={cn(state.reason === "stale" && "font-medium text-danger")}>
              {h.last_finished_at ? radarTime(h.last_finished_at) : ""} {h.age_seconds !== null ? `(${formatAge(h.age_seconds)})` : ""}
            </span>
          </Item>
          <Item label="Config rev">
            {h.rev_current === false ? (
              <span className="font-medium">
                <span className="font-mono text-[0.8125rem]">{h.config_rev}</span> applies next run
                <span className="block text-[0.75rem] font-normal text-ink-3">last run used {h.last_run_rev}</span>
              </span>
            ) : (
              <span className="font-mono text-[0.8125rem]">{h.last_run_rev ?? h.config_rev}</span>
            )}
          </Item>
          <Item label="Completed runs, 7 days">{h.runs_7d}</Item>
          <Item label="Awaiting review">{h.awaiting_review}</Item>
          <Item label="Sources with errors (last run)">
            <span className={cn(h.last_sources_with_errors > 0 && "font-medium text-danger")}>{h.last_sources_with_errors}</span>
          </Item>
          <Item label="Schedule">{h.paused ? <span className="font-medium">Paused</span> : "On"}</Item>
          {steps.length ? (
            <Item label="Last funnel" wide>
              <span className="tabular text-[0.8125rem]">{steps.map((k) => `${funnel![k]} ${FUNNEL_SHORT[k]}`).join(" → ")}</span>
            </Item>
          ) : null}
          {h.last_warnings ? (
            <Item label="Last warnings" wide>
              <span className="font-mono text-[0.75rem] text-muted-foreground">{h.last_warnings}</span>
            </Item>
          ) : null}
        </dl>
      ) : null}
      <div className="border-t pt-4">{children}</div>
    </div>
  );
}
