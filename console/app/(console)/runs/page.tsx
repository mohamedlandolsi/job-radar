import { requireSession } from "@/lib/session";
import { getCalibration, getFpLevers, getHealth, getRuns, getScoreBuckets } from "@/lib/radar";
import { completedToday } from "@/lib/run-format";
import { HealthCard } from "@/components/runs/health-card";
import { RunControls } from "@/components/runs/run-controls";
import { RunsTable } from "@/components/runs/runs-table";
import { Calibration } from "@/components/runs/calibration";

// Per-request private data: the layout's `instant = false` does not cover pages below it.
export const instant = false;

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>;
}

export default async function RunsPage() {
  await requireSession();
  const [health, runs, revs, levers, buckets] = await Promise.all([getHealth(), getRuns(30), getCalibration(), getFpLevers(), getScoreBuckets()]);
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Runs</h1>
      <section className="space-y-3" aria-label="Health">
        <H2>Health</H2>
        <HealthCard h={health}>
          <RunControls
            paused={health?.paused ?? false}
            requestedAt={health?.run_requested_at ?? null}
            runsToday={completedToday(runs)}
            running={health?.last_status === "running"}
          />
        </HealthCard>
      </section>
      <section className="space-y-3" aria-label="Runs">
        <H2>Last {runs.length} runs</H2>
        <RunsTable runs={runs} />
      </section>
      <section className="space-y-3" aria-label="Calibration">
        <H2>Calibration</H2>
        <Calibration revs={revs} levers={levers} buckets={buckets} />
      </section>
    </div>
  );
}
