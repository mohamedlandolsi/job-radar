import { ExternalLink } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getDropped, getGateReasons, getHealth, type DroppedPosting } from "@/lib/radar";
import { REASONS, STAGE_LABEL, reasonLabel } from "@/lib/reasons";
import { httpUrl, timeAgo } from "@/lib/format";
import { type DroppedQuery } from "@/lib/filtered-query";
import { FunnelBars } from "@/components/funnel-bars";
import { DROPPED_STAGES, GateReasonsTable, summarizeReasons } from "@/components/gate-reasons-table";
import { DroppedFilters } from "@/components/dropped-filters";
import { FlagControls } from "@/components/flag-controls";

// Per-request private data (searchParams): the layout's `instant = false` does not cover pages below it.
export const instant = false;

const LIMIT = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parseQuery(sp: Record<string, string | string[] | undefined>): DroppedQuery {
  const stage = one(sp.stage);
  const reason = one(sp.reason);
  const source = one(sp.source);
  return {
    stage: stage && (DROPPED_STAGES as readonly string[]).includes(stage) ? stage : undefined,
    reason: reason && /^[a-z_]{1,40}$/.test(reason) ? reason : undefined,
    source: source && /^[a-z0-9-]{1,40}$/.test(source) ? source : undefined,
    flagged: one(sp.flagged) === "1" || undefined,
  };
}

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {hint ? <p className="text-[0.8125rem] text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DroppedRow({ p }: { p: DroppedPosting }) {
  const url = httpUrl(p.url);
  const title = p.title ?? "Untitled posting";
  const gate = p.reason ? REASONS[p.reason]?.gate : undefined;
  return (
    <li className="space-y-2 rounded-lg border bg-card p-3">
      <div className="space-y-0.5">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-[0.9375rem] leading-snug font-semibold underline-offset-4 hover:underline [overflow-wrap:anywhere]"
          >
            {title}
            <ExternalLink className="mt-1 size-3.5 shrink-0 text-ink-3" aria-label="opens in a new tab" />
          </a>
        ) : (
          <p className="text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]">{title}</p>
        )}
        <p className="truncate text-[0.8125rem] text-muted-foreground">
          {[p.company && p.company !== "unknown" ? p.company : null, p.source].filter(Boolean).join(" · ")}
        </p>
      </div>
      <p className="text-[0.8125rem]">
        <span className="font-medium">{reasonLabel(p.reason) || "No reason recorded"}</span>
        <span className="text-ink-3">
          {" "}
          · {STAGE_LABEL[p.stage] ?? p.stage}
          {gate && gate.length === 1 ? ` (gate ${gate})` : ""}
        </span>
      </p>
      {p.reason_detail ? (
        <p className="rounded bg-secondary px-2 py-1.5 font-mono text-[0.75rem] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {p.reason_detail}
        </p>
      ) : null}
      {p.flag === "false_negative" ? (
        <p className="text-[0.8125rem] font-medium text-state-approved [overflow-wrap:anywhere]">
          Flagged as should have passed{p.flag_note ? `: ${p.flag_note}` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8125rem] text-ink-3" title={p.first_seen_at}>
          First seen {timeAgo(p.first_seen_at)}
          {p.gate_rev ? ` · rev ${p.gate_rev}` : ""}
        </span>
        <FlagControls id={p.posting_id} flagged={p.flag === "false_negative"} title={title} />
      </div>
    </li>
  );
}

export default async function FilteredPage({ searchParams }: PageProps<"/filtered">) {
  await requireSession();
  const q = parseQuery(await searchParams);
  const [health, gateRows, dropped] = await Promise.all([
    getHealth(),
    getGateReasons(),
    getDropped({ stage: q.stage, reason: q.reason, source: q.source, flagged: q.flagged ? true : undefined, limit: LIMIT }),
  ]);
  const reasons = summarizeReasons(gateRows);

  const running = health?.last_status === "running";
  const runLabel = health?.last_run_id
    ? `Run ${health.last_run_id}, ${health.last_status}${health.last_finished_at ? ` ${timeAgo(health.last_finished_at)}` : ""}`
    : null;
  const funnel = running ? null : (health?.last_funnel ?? null);

  // Filter options: what the last 7 days contain, plus the current selection (the list covers 14 days).
  const reasonCodes = new Set(reasons.filter((r) => (DROPPED_STAGES as readonly string[]).includes(r.stage)).map((r) => r.reason));
  if (q.reason) reasonCodes.add(q.reason);
  const sourceSet = new Set(gateRows.map((r) => r.source));
  if (q.source) sourceSet.add(q.source);
  const filtered = Boolean(q.stage || q.reason || q.source || q.flagged);

  return (
    <div className="space-y-8">
      <h1 className="sr-only">Filtered</h1>

      <Section title="Last run funnel" hint="Each step and how many postings it removed.">
        {running ? (
          <p className="text-[0.9375rem] text-ink-3">Run {health?.last_run_id} is still running. Its funnel shows here when it finishes.</p>
        ) : (
          <FunnelBars funnel={funnel} runLabel={runLabel} />
        )}
      </Section>

      <Section title="Why postings were dropped" hint="Last 7 days, all sources. Tap a reason to list its postings.">
        <GateReasonsTable rows={reasons} active={{ stage: q.stage, reason: q.reason }} />
      </Section>

      <Section id="dropped" title="Dropped postings" hint="Last 14 days, newest first. Flag the ones that should have passed.">
        <DroppedFilters
          key={JSON.stringify(q)}
          q={q}
          stages={DROPPED_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s }))}
          reasons={[...reasonCodes].sort().map((r) => ({ value: r, label: reasonLabel(r) }))}
          sources={[...sourceSet].sort().map((s) => ({ value: s, label: s }))}
        />
        {dropped.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-[0.9375rem] text-ink-3">
            {filtered ? "No dropped postings match these filters." : "No dropped postings in the last 14 days."}
          </p>
        ) : (
          <>
            <p className="text-[0.8125rem] text-ink-3">
              {dropped.length === LIMIT ? `Showing the newest ${LIMIT}. Narrow the filters to see older ones.` : `${dropped.length} postings`}
            </p>
            <ul className="space-y-2">
              {dropped.map((p) => (
                <DroppedRow key={p.posting_id} p={p} />
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
