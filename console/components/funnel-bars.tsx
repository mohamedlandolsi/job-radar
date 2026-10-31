import type { Funnel } from "@/lib/radar";

// Keys written by n8n/18_run_stats.js into jr_runs.funnel; "where" names the step that removes postings.
const STEPS: { key: string; label: string; where: string }[] = [
  { key: "fetched", label: "Fetched", where: "" },
  { key: "gate_a_pass", label: "Gate A pass", where: "at gate A (metadata)" },
  { key: "new_or_retry", label: "New or retry", where: "already seen (dedupe)" },
  { key: "detail_ok", label: "Detail ok", where: "without a description (deferred or failed)" },
  { key: "gate_b_pass", label: "Gate B pass", where: "at gate B (description)" },
  { key: "llm_calls", label: "LLM calls", where: "over the LLM cap (back in queue)" },
  { key: "matches", label: "Matches", where: "at gate C or below the minimum score" },
];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Last run's funnel as a sequence of horizontal bars, scaled to "fetched", with the change between steps.
export function FunnelBars({ funnel, runLabel }: { funnel: Funnel | null; runLabel: string | null }) {
  const values = STEPS.map((s) => num(funnel?.[s.key]));
  const top = values[0] ?? Math.max(0, ...values.map((v) => v ?? 0));
  if (!funnel || values.every((v) => v === null)) {
    return <p className="text-[0.9375rem] text-ink-3">No finished run yet, so there is no funnel to show.</p>;
  }

  return (
    <div className="space-y-1">
      {runLabel ? <p className="pb-1 text-[0.8125rem] text-ink-3">{runLabel}</p> : null}
      <ol className="space-y-0.5">
        {STEPS.map((s, i) => {
          const v = values[i];
          const prev = i > 0 ? values[i - 1] : null;
          const diff = v !== null && prev !== null ? prev - v : null;
          return (
            <li key={s.key}>
              {diff !== null && diff !== 0 ? (
                <p className="tabular py-0.5 pl-[7.5rem] text-[0.75rem] text-ink-3 sm:pl-[9rem]">
                  {diff > 0 ? `−${diff} ${s.where}` : `+${-diff} (postings that skip the previous step)`}
                </p>
              ) : null}
              <div className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 sm:grid-cols-[8.5rem_1fr_3.5rem]">
                <span className="truncate text-[0.8125rem] font-medium text-muted-foreground">{s.label}</span>
                <span className="h-2.5 rounded-sm bg-meter-track" aria-hidden>
                  <span
                    className="block h-full rounded-sm bg-meter-fill"
                    style={{ width: v === null || top === 0 ? "0%" : `${Math.max(v > 0 ? 1 : 0, Math.min(100, (v / top) * 100))}%` }}
                  />
                </span>
                <span className="tabular text-right font-semibold">{v ?? "-"}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
