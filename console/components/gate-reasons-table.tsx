import Link from "next/link";
import type { GateReason } from "@/lib/radar";
import { REASONS, STAGE_LABEL, reasonLabel } from "@/lib/reasons";
import { cn } from "@/lib/utils";
import { filteredHref } from "@/lib/filtered-query";

export type ReasonRow = { stage: string; reason: string; postings: number; flagged: number };

// v_jr_gate_reasons is per stage, reason and source: sum over sources, skip matched postings and rows without a reason.
export function summarizeReasons(rows: GateReason[]): ReasonRow[] {
  const map = new Map<string, ReasonRow>();
  for (const r of rows) {
    if (r.stage === "matched" || r.reason === "(none)") continue;
    const key = `${r.stage}|${r.reason}`;
    const row = map.get(key) ?? { stage: r.stage, reason: r.reason, postings: 0, flagged: 0 };
    row.postings += r.postings;
    row.flagged += r.flagged_false_negative;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.postings - a.postings || a.reason.localeCompare(b.reason));
}

// Stages listed by v_jr_dropped (the list below the table); queue stages have no rows there.
export const DROPPED_STAGES = ["dropped_a", "dropped_b", "dropped_llm", "below_score", "duplicate"] as const;

const GATE_LABEL: Record<string, string> = { A: "A", B: "B", C: "C", queue: "Queue", dedupe: "Dedupe" };

function GateBadge({ reason }: { reason: string }) {
  const gate = REASONS[reason]?.gate;
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-secondary px-1.5 text-[0.75rem] font-semibold text-muted-foreground">
      {gate ? GATE_LABEL[gate] : "?"}
    </span>
  );
}

// Why postings were dropped in the last 7 days. Each reason links to the list below, filtered to it.
export function GateReasonsTable({ rows, active }: { rows: ReasonRow[]; active?: { stage?: string; reason?: string } }) {
  if (rows.length === 0) return <p className="text-[0.9375rem] text-ink-3">No drops recorded in the last 7 days.</p>;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden grid-cols-[1fr_4rem_5rem_5rem_minmax(0,16rem)] gap-3 border-b px-3 py-2 text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
        <span>Reason</span>
        <span>Gate</span>
        <span className="text-right">Postings</span>
        <span className="text-right">Flagged</span>
        <span>Config lever</span>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li
            key={`${r.stage}|${r.reason}`}
            className={cn(
              "px-3 py-2.5 sm:grid sm:grid-cols-[1fr_4rem_5rem_5rem_minmax(0,16rem)] sm:items-center sm:gap-3",
              active?.reason === r.reason && (!active.stage || active.stage === r.stage) && "bg-secondary/70",
            )}
          >
            <span className="block min-w-0">
              {(DROPPED_STAGES as readonly string[]).includes(r.stage) ? (
                <Link
                  href={filteredHref({ stage: r.stage, reason: r.reason })}
                  className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground [overflow-wrap:anywhere]"
                >
                  {reasonLabel(r.reason)}
                </Link>
              ) : (
                <span className="font-medium [overflow-wrap:anywhere]">{reasonLabel(r.reason)}</span>
              )}
              <span className="block text-[0.75rem] text-ink-3">{STAGE_LABEL[r.stage] ?? r.stage}</span>
            </span>
            {/* Phones: one line under the reason. From sm up: three grid cells (sm:contents). */}
            <span className="mt-1.5 flex items-center gap-2 text-[0.8125rem] sm:contents">
              <span>
                <GateBadge reason={r.reason} />
              </span>
              <span className="tabular sm:text-right sm:text-[0.9375rem]">
                <span className="font-semibold">{r.postings}</span>
                <span className="text-ink-3 sm:hidden"> {r.postings === 1 ? "posting" : "postings"} ·</span>
              </span>
              <span className={cn("tabular sm:text-right sm:text-[0.9375rem]", r.flagged > 0 ? "font-semibold text-foreground" : "text-ink-3")}>
                {r.flagged}
                <span className="font-normal text-ink-3 sm:hidden"> flagged</span>
              </span>
            </span>
            <span className="mt-1 block font-mono text-[0.75rem] text-muted-foreground [overflow-wrap:anywhere] sm:mt-0">
              {REASONS[r.reason]?.lever ?? "(unknown reason code)"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
