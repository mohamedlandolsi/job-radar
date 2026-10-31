import "server-only";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { RadarConfig } from "@/lib/config-schema";

// Job Radar console: every read the dashboard makes. Reads only (writes live in app/(console)/actions.ts).
// Rules (console/CLAUDE.md): sql tagged template only, bigint/count cast to int in SQL, numeric cast to float8,
// timestamptz converted to ISO strings here so rows can be passed to Client Components, jsonb arrives as objects.
// Every function calls requireSession() as well, so a page that forgets it still leaks nothing.

type Row = Record<string, unknown>;
type Iso = string;

// Date | string | null -> ISO string | null
function iso(v: unknown): Iso | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? String(v) : new Date(t).toISOString();
}

// Converts the named timestamp columns of each row to ISO strings.
function withIso<T>(rows: Row[], keys: readonly string[]): T[] {
  return rows.map((r) => {
    const out: Row = { ...r };
    for (const k of keys) out[k] = iso(r[k]);
    return out as T;
  });
}

const clamp = (n: number | undefined, lo: number, hi: number, dflt: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n as number))) : dflt;

const MATCH_ID = /^[0-9a-f]{16}$/;

export type MatchStatus = "new" | "good" | "false_positive" | "applied" | "interviewing" | "offer" | "rejected";
export type Kind = "job" | "gig";
export type Funnel = Record<string, number>;

// ---------- matches -------------------------------------------------------

// Card fields shared by Today and Pipeline.
export type MatchCard = {
  match_id: string;
  url: string;
  source: string | null;
  kind: Kind;
  title: string | null;
  company: string | null;
  location_raw: string | null;
  work_mode: string | null;
  employment_type: string | null;
  final_score: number | null;
  priority: boolean;
  visa_status: string | null;
  min_years_required: number | null;
  status: MatchStatus;
  fp_reason: string | null;
  notes: string | null;
  posted_date: Iso | null;
  run_date: Iso;
  applied_at: Iso | null;
  reviewed_at: Iso | null;
  age_days: number;
};

const CARD_DATES = ["posted_date", "run_date", "applied_at", "reviewed_at"] as const;

export type InboxFilter = { kind?: Kind; mode?: string; source?: string };

// Today: new matches, best first.
export async function getInbox(filter: InboxFilter = {}): Promise<MatchCard[]> {
  await requireSession();
  const kind = filter.kind ?? null;
  const mode = filter.mode ?? null;
  const source = filter.source ?? null;
  const rows = (await sql`
    select match_id, url, source, kind, title, company, location_raw, work_mode, employment_type,
           final_score, priority, visa_status, min_years_required::float8 as min_years_required,
           status, fp_reason, notes, posted_date, run_date, applied_at, reviewed_at, age_days::int as age_days
    from v_jr_inbox
    where (${kind}::text is null or kind = ${kind})
      and (${mode}::text is null or coalesce(work_mode, 'unknown') = ${mode})
      and (${source}::text is null or coalesce(source, 'unknown') = ${source})
    order by priority desc, final_score desc nulls last, run_date desc`) as Row[];
  return withIso<MatchCard>(rows, CARD_DATES);
}

export type Count = { value: string; count: number };
export type InboxCounts = { job: number; gig: number; modes: Count[]; sources: Count[] };

// Today tab and chip counts. job/gig: all new matches; modes and sources: within `kind` when given (most first).
export async function getInboxCounts(kind?: Kind): Promise<InboxCounts> {
  await requireSession();
  const rows = (await sql`
    select kind, coalesce(work_mode, 'unknown') as work_mode, coalesce(source, 'unknown') as source, count(*)::int as n
    from v_jr_inbox
    group by 1, 2, 3`) as { kind: Kind; work_mode: string; source: string; n: number }[];
  const out: InboxCounts = { job: 0, gig: 0, modes: [], sources: [] };
  const modes = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "job" || r.kind === "gig") out[r.kind] += r.n;
    if (kind && r.kind !== kind) continue;
    modes.set(r.work_mode, (modes.get(r.work_mode) ?? 0) + r.n);
    sources.set(r.source, (sources.get(r.source) ?? 0) + r.n);
  }
  const sorted = (m: Map<string, number>): Count[] =>
    [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  out.modes = sorted(modes);
  out.sources = sorted(sources);
  return out;
}

export type MatchDetail = MatchCard & {
  run_id: number | null;
  why_match: string | null;
  red_flags: string | null;
  seniority: string | null;
  experience_evidence: string | null;
  languages_required: string | null;
  remote_region: string | null;
  contract_friendly: boolean | null;
  company_size_hint: string | null;
  salary: string | null;
  confidence: number | null;
  provider: string | null;
  score_breakdown: string | null;
  config_rev: string | null;
  created_at: Iso;
};

export type MatchEvent = {
  id: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  created_at: Iso;
};

// Match detail plus its audit trail (newest first). null when the id is malformed or unknown.
export async function getMatch(id: string): Promise<{ match: MatchDetail; events: MatchEvent[] } | null> {
  await requireSession();
  if (!MATCH_ID.test(id)) return null;
  const [rows, events] = await Promise.all([
    sql`
      select match_id, url, run_id::int as run_id, run_date, source, kind, title, company, location_raw, work_mode,
             employment_type, posted_date, final_score, priority, why_match, red_flags, seniority,
             min_years_required::float8 as min_years_required, experience_evidence, languages_required, visa_status,
             remote_region, contract_friendly, company_size_hint, salary, confidence, provider, score_breakdown,
             config_rev, status, fp_reason, notes, applied_at, reviewed_at, created_at,
             round(extract(epoch from now() - coalesce(posted_date, run_date)) / 86400)::int as age_days
      from jr_matches
      where match_id = ${id}`,
    sql`
      select id::int as id, action, before, after, actor, created_at
      from jr_events
      where entity = 'match' and entity_id = ${id}
      order by created_at desc, id desc`,
  ]);
  const match = withIso<MatchDetail>(rows as Row[], [...CARD_DATES, "created_at"])[0];
  if (!match) return null;
  return { match, events: withIso<MatchEvent>(events as Row[], ["created_at"]) };
}

export type PipelineTab = "shortlist" | "pipeline" | "closed" | "not_a_fit";

export const PIPELINE_STATUSES: Record<PipelineTab, MatchStatus[]> = {
  shortlist: ["good"],
  pipeline: ["applied", "interviewing", "offer"],
  closed: ["rejected"],
  not_a_fit: ["false_positive"],
};

export const PIPELINE_TABS = Object.keys(PIPELINE_STATUSES) as PipelineTab[];

// Tab counts for /pipeline (one grouped query, rolled up per tab).
export async function getPipelineCounts(): Promise<Record<PipelineTab, number>> {
  await requireSession();
  const rows = (await sql`
    select status, count(*)::int as n
    from jr_matches
    where status <> 'new'
    group by status`) as { status: MatchStatus; n: number }[];
  const out = Object.fromEntries(PIPELINE_TABS.map((t) => [t, 0])) as Record<PipelineTab, number>;
  for (const r of rows) {
    const tab = PIPELINE_TABS.find((t) => PIPELINE_STATUSES[t].includes(r.status));
    if (tab) out[tab] += r.n;
  }
  return out;
}

// Pipeline tabs. Shortlist: best score first; the others: most recently reviewed or applied first.
export async function getPipeline(tab: PipelineTab): Promise<MatchCard[]> {
  await requireSession();
  const statuses = PIPELINE_STATUSES[tab];
  if (!statuses) return [];
  const byScore = tab === "shortlist";
  const rows = (await sql`
    select match_id, url, source, kind, title, company, location_raw, work_mode, employment_type,
           final_score, priority, visa_status, min_years_required::float8 as min_years_required,
           status, fp_reason, notes, posted_date, run_date, applied_at, reviewed_at,
           round(extract(epoch from now() - coalesce(posted_date, run_date)) / 86400)::int as age_days
    from jr_matches
    where status = any(${statuses}::text[])
    order by case when ${byScore}::boolean then final_score end desc nulls last,
             coalesce(reviewed_at, applied_at, created_at) desc`) as Row[];
  return withIso<MatchCard>(rows, CARD_DATES);
}

// ---------- funnel ----------------------------------------------------------

export type DroppedPosting = {
  posting_id: string;
  url: string;
  source: string;
  kind: Kind;
  title: string | null;
  company: string | null;
  location_raw: string | null;
  work_mode: string | null;
  employment_type: string | null;
  posted_at: Iso | null;
  first_seen_at: Iso;
  stage: string;
  reason: string | null;
  reason_detail: string | null;
  final_score: number | null;
  flag: "false_negative" | null;
  flag_note: string | null;
  gate_rev: string | null;
};

export type DroppedFilter = { stage?: string; reason?: string; source?: string; flagged?: boolean; limit?: number };

// Dropped postings of the last 14 days, newest first. flagged: true = only "should have passed", false = only unflagged.
export async function getDropped(filter: DroppedFilter = {}): Promise<DroppedPosting[]> {
  await requireSession();
  const stage = filter.stage ?? null;
  const reason = filter.reason ?? null;
  const source = filter.source ?? null;
  const flagged = typeof filter.flagged === "boolean" ? filter.flagged : null;
  const limit = clamp(filter.limit, 1, 500, 100);
  const rows = (await sql`
    select posting_id, url, source, kind, title, company, location_raw, work_mode, employment_type, posted_at,
           first_seen_at, stage, reason, reason_detail, final_score, flag, flag_note, gate_rev
    from v_jr_dropped
    where (${stage}::text is null or stage = ${stage})
      and (${reason}::text is null or reason = ${reason})
      and (${source}::text is null or source = ${source})
      and (${flagged}::boolean is null or (flag is not distinct from 'false_negative') = ${flagged})
    order by first_seen_at desc, posting_id
    limit ${limit}`) as Row[];
  return withIso<DroppedPosting>(rows, ["posted_at", "first_seen_at"]);
}

export type GateReason = {
  stage: string;
  reason: string;
  source: string;
  postings: number;
  flagged_false_negative: number;
};

// Drop reasons of the last 7 days, per stage, reason and source (most postings first).
export async function getGateReasons(): Promise<GateReason[]> {
  await requireSession();
  return (await sql`
    select stage, reason, source, postings::int as postings, flagged_false_negative::int as flagged_false_negative
    from v_jr_gate_reasons
    order by postings desc, stage, reason, source`) as GateReason[];
}

export type SourceHealth = {
  source: string;
  runs: number;
  fetched: number;
  gate_a_pass: number;
  new_postings: number;
  gate_b_pass: number;
  matches: number;
  errors: number;
  last_ok_at: Iso | null;
  last_error: string | null;
};

// Per source over the completed runs of the last 7 days.
export async function getSourceHealth(): Promise<SourceHealth[]> {
  await requireSession();
  const rows = (await sql`
    select source, runs::int as runs, fetched::int as fetched, gate_a_pass::int as gate_a_pass,
           new_postings::int as new_postings, gate_b_pass::int as gate_b_pass, matches::int as matches,
           errors::int as errors, last_ok_at, last_error
    from v_jr_source_health
    order by fetched desc, source`) as Row[];
  return withIso<SourceHealth>(rows, ["last_ok_at"]);
}

// ---------- config ----------------------------------------------------------

export type ActiveConfig = {
  id: number;
  rev: string;
  // Saved through jr_save_config (SQL validator) and, from the console, zod. Re-parse with parseConfigText before editing.
  payload: RadarConfig;
  payload_text: string;
  note: string | null;
  created_at: Iso;
};

export async function getActiveConfig(): Promise<ActiveConfig | null> {
  await requireSession();
  const rows = (await sql`
    select id::int as id, rev, payload, payload_text, note, created_at
    from v_jr_active_config`) as Row[];
  return withIso<ActiveConfig>(rows, ["created_at"])[0] ?? null;
}

export type ConfigVersionSummary = {
  id: number;
  rev: string;
  note: string | null;
  created_by: string;
  created_at: Iso;
  chars: number;
  active: boolean;
};

// Version list without payloads (newest first).
export async function getConfigVersions(limit = 20): Promise<ConfigVersionSummary[]> {
  await requireSession();
  const n = clamp(limit, 1, 200, 20);
  const rows = (await sql`
    select id::int as id, rev, note, created_by, created_at, length(payload_text)::int as chars,
           id = (select max(id) from jr_config_versions) as active
    from jr_config_versions
    order by id desc
    limit ${n}`) as Row[];
  return withIso<ConfigVersionSummary>(rows, ["created_at"]);
}

export type ConfigVersion = {
  id: number;
  rev: string;
  payload_text: string;
  note: string | null;
  created_by: string;
  created_at: Iso;
};

// One version with its exact saved text (for diff and "Restore as new rev").
export async function getConfigVersion(id: number): Promise<ConfigVersion | null> {
  await requireSession();
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const rows = (await sql`
    select id::int as id, rev, payload_text, note, created_by, created_at
    from jr_config_versions
    where id = ${id}`) as Row[];
  return withIso<ConfigVersion>(rows, ["created_at"])[0] ?? null;
}

// ---------- runs and health ---------------------------------------------------

export type RunStatus = "running" | "completed" | "failed";

export type Run = {
  run_id: number;
  trigger: "schedule" | "requested" | "manual";
  config_rev: string | null;
  status: RunStatus;
  started_at: Iso;
  finished_at: Iso | null;
  duration_seconds: number | null;
  funnel: Funnel;
  providers: string | null;
  failures: number | null;
  warnings: string | null;
  errors_sample: string | null;
};

// Latest runs first. source_stats is left out (v_jr_source_health aggregates it).
export async function getRuns(limit = 30): Promise<Run[]> {
  await requireSession();
  const n = clamp(limit, 1, 200, 30);
  const rows = (await sql`
    select run_id::int as run_id, trigger, config_rev, status, started_at, finished_at,
           extract(epoch from finished_at - started_at)::int as duration_seconds,
           funnel, providers, failures, warnings, errors_sample
    from jr_runs
    order by run_id desc
    limit ${n}`) as Row[];
  return withIso<Run>(rows, ["started_at", "finished_at"]);
}

export type Health = {
  last_run_id: number | null;
  last_status: RunStatus | null;
  last_started_at: Iso | null;
  last_finished_at: Iso | null;
  age_seconds: number | null;
  last_run_rev: string | null;
  last_funnel: Funnel | null;
  last_warnings: string | null;
  last_sources_with_errors: number;
  runs_7d: number;
  config_rev: string | null;
  rev_current: boolean | null;
  paused: boolean;
  run_requested_at: Iso | null;
  awaiting_review: number;
};

// One row (the view left-joins the latest run, so it exists even before the first run).
export async function getHealth(): Promise<Health | null> {
  await requireSession();
  const rows = (await sql`
    select last_run_id::int as last_run_id, last_status, last_started_at, last_finished_at, age_seconds,
           last_run_rev, last_funnel, last_warnings, last_sources_with_errors, runs_7d, config_rev,
           rev_current, coalesce(paused, false) as paused, run_requested_at, awaiting_review
    from v_jr_health`) as Row[];
  return withIso<Health>(rows, ["last_started_at", "last_finished_at", "run_requested_at"])[0] ?? null;
}

// ---------- calibration -------------------------------------------------------

export type Calibration = {
  rev: string;
  matches: number;
  reviewed: number;
  good: number;
  false_positive: number;
  applied: number;
  precision_pct: number | null;
  avg_score: number | null;
  first_run: Iso | null;
  last_run: Iso | null;
};

// Precision per config rev, newest rev first.
export async function getCalibration(): Promise<Calibration[]> {
  await requireSession();
  const rows = (await sql`
    select rev, matches, reviewed, good, false_positive, applied, precision_pct, avg_score, first_run, last_run
    from v_jr_calibration
    order by last_run desc nulls last, rev`) as Row[];
  return withIso<Calibration>(rows, ["first_run", "last_run"]);
}

export type FpLever = {
  fp_reason: string;
  config_key: string;
  advice: string;
  total: number;
  last_30d: number;
};

// False positives per reason with the config lever to pull (most frequent first).
export async function getFpLevers(): Promise<FpLever[]> {
  await requireSession();
  return (await sql`
    select fp_reason, config_key, advice, total::int as total, last_30d::int as last_30d
    from v_jr_fp_levers
    order by total desc, last_30d desc, fp_reason`) as FpLever[];
}

export type ScoreBucket = {
  bucket: number;
  matches: number;
  reviewed: number;
  good: number;
  false_positive: number;
};

// Score buckets of 5 points (ascending), good vs not a fit.
export async function getScoreBuckets(): Promise<ScoreBucket[]> {
  await requireSession();
  return (await sql`
    select bucket::int as bucket, matches, reviewed, good, false_positive
    from v_jr_score_buckets
    order by bucket`) as ScoreBucket[];
}
