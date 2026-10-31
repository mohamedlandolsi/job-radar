import { Pause, TriangleAlert } from "lucide-react";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";

type Health = {
  last_run_id: number | null;
  last_status: string | null;
  last_started_at: Date | null;
  age_seconds: number | null;
  last_run_rev: string | null;
  config_rev: string | null;
  rev_current: boolean | null;
  paused: boolean | null;
  awaiting_review: number;
};

const STALE_SECONDS = 36 * 3600;

// Header chip from v_jr_health: last run age, config rev, paused, awaiting review.
// Red with an icon when there is no run yet, the last run failed, or it is older than 36 hours.
export async function RadarHealth() {
  await requireSession();
  const rows = (await sql`
    select last_run_id::int as last_run_id, last_status, last_started_at, age_seconds, last_run_rev,
           config_rev, rev_current, paused, awaiting_review
    from v_jr_health`) as Health[];
  const h = rows[0];
  const paused = h?.paused === true;

  if (!h || h.last_run_id === null || h.age_seconds === null) {
    return (
      <span className="flex items-center gap-1 text-[0.8125rem] font-medium whitespace-nowrap text-danger">
        <TriangleAlert className="size-3.5" aria-hidden />
        No run yet
        {paused ? <span className="text-ink-3">(paused)</span> : null}
      </span>
    );
  }

  const failed = h.last_status === "failed";
  const stale = h.age_seconds > STALE_SECONDS;
  const red = failed || stale;
  const running = h.last_status === "running";
  const started = h.last_started_at ? new Date(h.last_started_at).toISOString() : "unknown";
  const revNote = h.rev_current === false ? `rev ${h.config_rev} applies next run` : `rev ${h.last_run_rev}`;

  return (
    <span
      className="flex min-w-0 items-center gap-2 text-[0.8125rem] whitespace-nowrap"
      title={`Run ${h.last_run_id} (${h.last_status}), started ${started}, ${revNote}`}
    >
      <span className={cn("tabular flex items-center gap-1", red ? "font-medium text-danger" : "text-ink-3")}>
        {red ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
        {failed ? "Run failed" : running ? "Running" : "Ran"} {formatAge(h.age_seconds)}
      </span>
      {paused ? (
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Pause className="size-3.5" aria-hidden />
          Paused
        </span>
      ) : null}
      <span className={cn("hidden md:inline", h.rev_current === false ? "font-semibold text-foreground" : "text-ink-3")}>
        {h.rev_current === false ? `New rev ${h.config_rev} pending` : `Rev ${h.last_run_rev}`}
      </span>
      {h.awaiting_review > 0 ? (
        <span className="tabular font-semibold text-foreground">
          {h.awaiting_review}
          <span className="hidden sm:inline"> to review</span>
          <span className="sm:hidden"> new</span>
        </span>
      ) : null}
    </span>
  );
}
