import type { Calibration as CalibrationRow, FpLever, ScoreBucket } from "@/lib/radar";
import { FP_REASONS } from "@/lib/reasons";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScoreBucketsChart } from "@/components/runs/score-buckets-chart";

function Sub({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-[0.8125rem] text-ink-3">{hint}</p>
      </div>
      {children}
    </div>
  );
}

// Calibration: precision per config rev, false positives per reason with the lever to pull, score buckets.
export function Calibration({ revs, levers, buckets }: { revs: CalibrationRow[]; levers: FpLever[]; buckets: ScoreBucket[] }) {
  return (
    <div className="space-y-4">
      <Sub title="Precision per rev" hint="Share of reviewed matches you kept (good, applied or further). Compare revs after changing a rule.">
        {revs.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-3">No matches yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[0.8125rem]">
              <thead className="text-[0.75rem] text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Rev</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Precision</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Reviewed</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Good</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Not a fit</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Applied</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Avg score</th>
                  <th className="py-1.5 font-medium">Last match</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {revs.map((r) => (
                  <tr key={r.rev} data-rev={r.rev} className="border-t">
                    <td className="py-1.5 pr-3 font-mono text-[0.75rem]">{r.rev}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{r.precision_pct === null ? <span className="font-normal text-ink-3">-</span> : `${r.precision_pct}%`}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {r.reviewed} <span className="text-ink-3">of {r.matches}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{r.good}</td>
                    <td className="py-1.5 pr-3 text-right">{r.false_positive}</td>
                    <td className="py-1.5 pr-3 text-right">{r.applied}</td>
                    <td className="py-1.5 pr-3 text-right">{r.avg_score ?? "-"}</td>
                    <td className="py-1.5 text-ink-3" title={r.last_run ?? undefined}>
                      {r.last_run ? timeAgo(r.last_run) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sub>

      <Sub title="False positives per reason" hint="Matches you marked as not a fit, and the config lever that would have stopped them.">
        <ul className="divide-y">
          {levers.map((l) => (
            <li key={l.fp_reason} data-reason={l.fp_reason} className={cn("space-y-1 py-2.5", l.total === 0 && "opacity-60")}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{FP_REASONS[l.fp_reason] ?? l.fp_reason}</span>
                <span className="tabular text-[0.8125rem]">
                  <span className={cn("font-semibold", l.total > 0 ? "text-foreground" : "text-ink-3")}>{l.total}</span>
                  <span className="text-ink-3"> total · {l.last_30d} in 30 days</span>
                </span>
              </p>
              <p className="font-mono text-[0.75rem] text-muted-foreground [overflow-wrap:anywhere]">{l.config_key}</p>
              <p className="text-[0.8125rem] text-muted-foreground">{l.advice}</p>
            </li>
          ))}
        </ul>
      </Sub>

      <Sub title="Score buckets" hint="Reviewed matches per score: if not-a-fit piles up just above the minimum score, raise it.">
        <ScoreBucketsChart buckets={buckets} />
      </Sub>
    </div>
  );
}
