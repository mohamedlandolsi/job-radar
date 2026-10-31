import type { ScoreBucket } from "@/lib/radar";
import { cn } from "@/lib/utils";

// Two series, categorical slots 1 and 2 of the dataviz reference palette (validated light and dark on --card).
const SERIES = [
  { key: "good", label: "Good fit", hint: "good, applied, interviewing, offer or rejected", swatch: "bg-series-1" },
  { key: "false_positive", label: "Not a fit", hint: "marked as not a fit", swatch: "bg-series-2" },
] as const;

function Bar({ value, max, swatch, label, bucket }: { value: number; max: number; swatch: string; label: string; bucket: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const name = `Score ${bucket}: ${value} ${label.toLowerCase()}`;
  return (
    // Hit target: the whole row (bigger than the mark); tooltip on hover and keyboard focus.
    <div tabIndex={0} aria-label={name} className="group/bar relative flex h-5 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
      {value > 0 ? (
        <span
          aria-hidden
          className={cn("block h-2.5 rounded-r-[4px] transition-[filter] group-hover/bar:brightness-110 group-focus/bar:brightness-110", swatch)}
          style={{ width: `max(${pct}%, 4px)` }}
        />
      ) : null}
      <span aria-hidden className={cn("tabular text-[0.75rem]", value > 0 ? "text-foreground" : "text-ink-3")}>
        {value}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-[0.75rem] whitespace-nowrap text-popover-foreground shadow-md group-hover/bar:block group-focus/bar:block"
      >
        <span className="font-medium">Score {bucket}</span>: {value} {label.toLowerCase()}
      </span>
    </div>
  );
}

// Good vs not a fit per 5-point score bucket (v_jr_score_buckets), horizontal bars on one shared scale.
export function ScoreBucketsChart({ buckets }: { buckets: ScoreBucket[] }) {
  const reviewed = buckets.filter((b) => b.good + b.false_positive > 0);
  if (!reviewed.length) return <p className="text-[0.9375rem] text-ink-3">No reviewed matches yet. Verdicts on Today fill this chart.</p>;
  const max = Math.max(...buckets.map((b) => Math.max(b.good, b.false_positive)));
  const range = (b: number) => `${b} to ${Math.min(100, b + 4)}`;
  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">Reviewed matches per score bucket: good fit against not a fit</figcaption>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5" title={s.hint}>
            <span aria-hidden className={cn("inline-block size-2.5 rounded-[2px]", s.swatch)} />
            <span className="text-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        {buckets.map((b) => (
          <div key={b.bucket} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[5.5rem_1fr]">
            <span className="tabular text-[0.8125rem] text-muted-foreground">{range(b.bucket)}</span>
            <div className="space-y-[2px] border-l border-border pl-0">
              <Bar value={b.good} max={max} swatch="bg-series-1" label="Good fit" bucket={range(b.bucket)} />
              <Bar value={b.false_positive} max={max} swatch="bg-series-2" label="Not a fit" bucket={range(b.bucket)} />
            </div>
          </div>
        ))}
      </div>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[0.8125rem] font-medium underline-offset-4 hover:underline sm:min-h-0">
          Show as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-[0.8125rem]">
            <thead className="text-[0.75rem] text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Score</th>
                <th className="py-1 pr-3 text-right font-medium">Matches</th>
                <th className="py-1 pr-3 text-right font-medium">Reviewed</th>
                <th className="py-1 pr-3 text-right font-medium">Good fit</th>
                <th className="py-1 text-right font-medium">Not a fit</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {buckets.map((b) => (
                <tr key={b.bucket} className="border-t">
                  <td className="py-1 pr-3">{range(b.bucket)}</td>
                  <td className="py-1 pr-3 text-right">{b.matches}</td>
                  <td className="py-1 pr-3 text-right">{b.reviewed}</td>
                  <td className="py-1 pr-3 text-right">{b.good}</td>
                  <td className="py-1 text-right">{b.false_positive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
