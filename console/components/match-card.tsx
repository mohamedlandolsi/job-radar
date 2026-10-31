import Link from "next/link";
import type { MatchCard as MatchCardRow } from "@/lib/radar";
import { ageLabel, yearsLabel } from "@/lib/match-display";
import { FP_REASONS } from "@/lib/reasons";
import { ScoreMeter } from "@/components/score-meter";
import { KindChip, PriorityStar, StatusChip, VisaChip, WorkModeChip } from "@/components/match-chips";
import { cn } from "@/lib/utils";

// One match as a tappable card (Today and Pipeline). Server-safe: no client JavaScript.
export function MatchCard({ m, showStatus = false }: { m: MatchCardRow; showStatus?: boolean }) {
  const meta = [m.company, m.source, m.location_raw].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/m/${m.match_id}`}
        className="block rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex items-start gap-1.5">
              <PriorityStar priority={m.priority} />
              <span
                className={cn(
                  "min-w-0 text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]",
                  m.status === "false_positive" && "text-ink-3 line-through",
                )}
              >
                {m.title ?? "Untitled posting"}
              </span>
            </p>
            {meta ? <p className="truncate text-[0.8125rem] text-muted-foreground">{meta}</p> : null}
          </div>
          <ScoreMeter score={m.final_score} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showStatus ? <StatusChip status={m.status} /> : null}
          <KindChip kind={m.kind} />
          <WorkModeChip mode={m.work_mode} />
          <VisaChip status={m.visa_status} />
          <span className="tabular text-[0.8125rem] text-ink-3">
            {yearsLabel(m.min_years_required)}
            {m.age_days !== null ? <> · {ageLabel(m.age_days)}</> : null}
          </span>
        </div>

        {showStatus && m.status === "false_positive" && m.fp_reason ? (
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">{FP_REASONS[m.fp_reason] ?? m.fp_reason}</p>
        ) : null}
      </Link>
    </li>
  );
}
