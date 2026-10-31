import Link from "next/link";
import type { MatchCard as MatchCardRow, PipelineTab } from "@/lib/radar";
import { ageLabel, yearsLabel } from "@/lib/match-display";
import { timeAgo } from "@/lib/format";
import { FP_REASONS } from "@/lib/reasons";
import { ScoreMeter } from "@/components/score-meter";
import { KindChip, PriorityStar, StatusChip, VisaChip, WorkModeChip } from "@/components/match-chips";
import { cn } from "@/lib/utils";

type Context = { from: "today" } | { from: "pipeline"; tab: PipelineTab };

function DateStamp({ label, iso }: { label: string; iso: string | null }) {
  if (!iso) return null;
  return (
    <span title={iso}>
      {label} {timeAgo(iso)}
    </span>
  );
}

// One match as a tappable card (Today and Pipeline). Server-safe: no client JavaScript.
// Pipeline adds the status chip, applied and reviewed dates, the fp_reason label and a notes preview.
export function MatchCard({ m, context = { from: "today" } }: { m: MatchCardRow; context?: Context }) {
  const pipeline = context.from === "pipeline";
  const notAFit = m.status === "false_positive";
  const meta = [m.company, m.source, m.location_raw].filter(Boolean).join(" · ");
  const href = pipeline ? `/m/${m.match_id}?from=pipeline&tab=${context.tab}` : `/m/${m.match_id}`;
  const notes = m.notes?.trim();

  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex items-start gap-1.5">
              <PriorityStar priority={m.priority} />
              <span
                className={cn(
                  "min-w-0 text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]",
                  notAFit && "text-ink-3 line-through",
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
          {pipeline ? <StatusChip status={m.status} /> : null}
          <KindChip kind={m.kind} />
          <WorkModeChip mode={m.work_mode} />
          <VisaChip status={m.visa_status} />
          <span className="tabular text-[0.8125rem] text-ink-3">
            {yearsLabel(m.min_years_required)}
            {m.age_days !== null ? <> · {ageLabel(m.age_days)}</> : null}
          </span>
        </div>

        {pipeline && notAFit && m.fp_reason ? (
          <p className="mt-1.5 text-[0.8125rem] font-medium text-muted-foreground">{FP_REASONS[m.fp_reason] ?? m.fp_reason}</p>
        ) : null}

        {pipeline && (m.applied_at || m.reviewed_at) ? (
          <p className="tabular mt-1.5 flex flex-wrap gap-x-1.5 text-[0.8125rem] text-ink-3">
            <DateStamp label="Applied" iso={m.applied_at} />
            {m.applied_at && m.reviewed_at ? <span aria-hidden>·</span> : null}
            <DateStamp label="Reviewed" iso={m.reviewed_at} />
          </p>
        ) : null}

        {pipeline && notes ? (
          <p className="mt-1.5 line-clamp-2 border-l-2 pl-2 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
            {notes}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
