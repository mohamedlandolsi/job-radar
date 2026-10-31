import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getMatch, type MatchDetail } from "@/lib/radar";
import { httpUrl, timeAgo } from "@/lib/format";
import { ageLabel, visaInfo, workModeLabel, yearsLabel } from "@/lib/match-display";
import { FP_REASONS } from "@/lib/reasons";
import { ScoreMeter } from "@/components/score-meter";
import { ScoreLedger } from "@/components/score-ledger";
import { KindChip, PriorityStar, StatusChip, VisaChip } from "@/components/match-chips";
import { VerdictBar } from "@/components/verdict-bar";
import { MatchNotes } from "@/components/match-notes";
import { EventHistory } from "@/components/event-history";
import { ALLOWED_VERDICTS } from "@/lib/match-display";
import type { reviewMatch } from "@/app/(console)/actions";

type FpReason = NonNullable<Parameters<typeof reviewMatch>[0]["fp_reason"]>;

// Per-request private data (params): the layout's `instant = false` does not cover pages below it.
export const instant = false;

const NONE = /^(none|n\/a|no|-|null)?$/i;
const text = (v: string | null) => (v && !NONE.test(v.trim()) ? v.trim() : null);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Attr({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[0.8125rem] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const missing = <span className="text-ink-3">not stated</span>;

function Attributes({ m }: { m: MatchDetail }) {
  const visa = visaInfo(m.visa_status);
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <Attr label="Seniority">{text(m.seniority) ?? missing}</Attr>
      <Attr label="Experience required">
        {yearsLabel(m.min_years_required)}
        {text(m.experience_evidence) ? (
          <span className="mt-1 block font-mono text-[0.8125rem] text-muted-foreground">{m.experience_evidence}</span>
        ) : null}
      </Attr>
      <Attr label="Work mode">{workModeLabel(m.work_mode)}</Attr>
      <Attr label="Remote region">{text(m.remote_region) ?? missing}</Attr>
      <Attr label="Location">{text(m.location_raw) ?? missing}</Attr>
      <Attr label="Languages">{text(m.languages_required) ?? missing}</Attr>
      <Attr label="Visa">
        {visa.tone === "hidden" ? missing : <VisaChip status={m.visa_status} showUnknown />}
      </Attr>
      <Attr label="Employment type">{text(m.employment_type)?.replace(/_/g, " ") ?? missing}</Attr>
      <Attr label="Salary">{text(m.salary) ?? missing}</Attr>
      <Attr label="Company size">{text(m.company_size_hint) ?? missing}</Attr>
    </dl>
  );
}

export default async function MatchPage({ params }: PageProps<"/m/[id]">) {
  await requireSession();
  const data = await getMatch((await params).id);
  if (!data) notFound();
  const { match: m, events } = data;
  const url = httpUrl(m.url);
  const hasVerdicts = ALLOWED_VERDICTS[m.status].length > 0;
  const redFlags = text(m.red_flags);
  const why = text(m.why_match);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/" className="inline-flex h-9 items-center gap-1 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Today
      </Link>

      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="flex items-start gap-1.5 text-xl leading-snug font-semibold [overflow-wrap:anywhere]">
              {m.priority ? (
                <span className="mt-1.5">
                  <PriorityStar priority />
                </span>
              ) : null}
              <span className={m.status === "false_positive" ? "text-ink-3 line-through" : undefined}>
                {m.title ?? "Untitled posting"}
              </span>
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground">
              {[m.company, m.source].filter(Boolean).join(" · ")}
              {m.age_days !== null ? <span className="text-ink-3"> · {ageLabel(m.age_days)}</span> : null}
            </p>
          </div>
          <ScoreMeter score={m.final_score} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={m.status} />
          <KindChip kind={m.kind} />
          {m.status === "false_positive" && m.fp_reason ? (
            <span className="text-[0.8125rem] text-ink-3">{FP_REASONS[m.fp_reason] ?? m.fp_reason}</span>
          ) : null}
          {m.applied_at ? <span className="text-[0.8125rem] text-ink-3">Applied {timeAgo(m.applied_at)}</span> : null}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border bg-card px-3 text-[0.9375rem] font-medium hover:bg-secondary sm:h-9"
          >
            Open the posting
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
        <VerdictBar id={m.match_id} status={m.status} />
      </header>

      <Section title="Why it matches">
        {why ? <p className="max-w-[64ch] font-serif text-[1.0625rem] leading-[1.6] whitespace-pre-wrap">{why}</p> : <p className="text-ink-3">No summary recorded.</p>}
      </Section>

      <Section title="Red flags">
        {redFlags ? <p className="max-w-[64ch] text-[0.9375rem] whitespace-pre-wrap">{redFlags}</p> : <p className="text-ink-3">None noted.</p>}
      </Section>

      <Section title="Details">
        <Attributes m={m} />
      </Section>

      <Section title="Score">
        <ScoreLedger breakdown={m.score_breakdown} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pt-2 text-[0.8125rem] sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{m.provider ?? "unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="tabular font-medium">{m.confidence ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Config rev</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{m.config_rev ?? "unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Run</dt>
            <dd className="tabular font-medium">{m.run_id ?? "-"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Notes">
        <MatchNotes
          key={m.notes ?? ""}
          id={m.match_id}
          notes={m.notes}
          fpReason={m.status === "false_positive" ? (m.fp_reason as FpReason | null) : null}
        />
      </Section>

      <Section title="History">
        <EventHistory events={events} />
      </Section>

      {/* Phones: room for the fixed verdict bar above the tab bar. */}
      {hasVerdicts ? <div className="h-16 sm:hidden" aria-hidden /> : null}
    </article>
  );
}
