// Job Radar console: one map from engine reason codes to plain words and the config lever behind them.
// Codes come from the n8n gates (A: metadata, B: description, C: LLM re-check) and jr_ingest/jr_record_postings.
export type Gate = "A" | "B" | "C" | "queue" | "dedupe";
export type Reason = { label: string; gate: Gate; lever: string };

export const REASONS: Record<string, Reason> = {
  // gate A (metadata)
  kind_disabled: { label: "Jobs or gigs switched off", gate: "A", lever: "opportunity.jobs / opportunity.gigs" },
  employment_type: { label: "Employment type not wanted", gate: "A", lever: "opportunity.employment_types" },
  stale: { label: "Older than the freshness window", gate: "A", lever: "freshness.window_days" },
  title_blocked: { label: "Blocked title (sales or other role)", gate: "A", lever: "search.title_block_terms" },
  title_senior: { label: "Senior title", gate: "A", lever: "search.title_senior_regex" },
  seniority_hint: { label: "Board says mid or senior", gate: "A", lever: "experience.seniority_ok" },
  role_mismatch: { label: "Not a target role", gate: "A", lever: "search.role_terms / search.min_skill_hits" },
  visa_flag_false: { label: "Arbeitnow without visa flag", gate: "A", lever: "sources.arbeitnow.visa_only" },
  mode_disabled: { label: "Work mode switched off", gate: "A", lever: "work_modes.*.enabled" },
  remote_region: { label: "Remote, but region blocked", gate: "A", lever: "work_modes.remote.location_block" },
  country_not_target: { label: "Country not in targets", gate: "A", lever: "visa.target_countries" },
  mode_unknown: { label: "Work mode unknown", gate: "A", lever: "work_modes.unknown_policy" },
  reddit_for_hire: { label: "Reddit [For Hire] offer, not a job", gate: "A", lever: "(fixed rule)" },
  reddit_not_hiring: { label: "Reddit post without a hiring signal", gate: "A", lever: "(fixed rule)" },
  same_company_title: { label: "Same company and title on another board (at ingest, or at match time once the company is known)", gate: "dedupe", lever: "(dedupe key)" },
  // gate B (description)
  detail_deferred: { label: "Description fetch deferred (cap)", gate: "queue", lever: "llm.detail_cap" },
  detail_retry: { label: "Description fetch failed, will retry", gate: "queue", lever: "(retries 3 times)" },
  no_description: { label: "No usable description", gate: "B", lever: "(source)" },
  experience_years: { label: "Requires more experience", gate: "B", lever: "experience.max_years_required" },
  language: { label: "Requires a blocked language", gate: "B", lever: "languages.blocked" },
  banned_phrase: { label: "Banned phrase", gate: "B", lever: "languages.banned_phrases" },
  opportunity_blocked: { label: "Unpaid or commission offer (rev share, per meeting, partnership)", gate: "B", lever: "opportunity.block_phrases" },
  visa_negative: { label: "No visa sponsorship", gate: "B", lever: "visa.negative_terms" },
  work_authorization: { label: "Needs existing work authorization", gate: "B", lever: "visa.work_auth_terms" },
  visa_unknown: { label: "Hybrid or on-site without a visa signal", gate: "B", lever: "visa.unknown_policy / visa.known_sponsors" },
  remote_region_desc: { label: "Remote, region restricted in text", gate: "B", lever: "work_modes.remote.desc_block" },
  // queue
  slice_cap: { label: "Over the LLM cap, back in queue", gate: "queue", lever: "llm.slice_cap / llm.max_per_source" },
  llm_time_budget: { label: "Out of run time, back in queue", gate: "queue", lever: "N8N_RUNNERS_TASK_TIMEOUT / llm.pace_ms" },
  // gate C (LLM re-check)
  llm_experience: { label: "LLM: requires more experience", gate: "C", lever: "experience.max_years_required" },
  llm_seniority: { label: "LLM: seniority too high", gate: "C", lever: "experience.seniority_ok" },
  llm_language: { label: "LLM: blocked language required", gate: "C", lever: "languages.blocked" },
  llm_work_mode: { label: "LLM: work mode switched off", gate: "C", lever: "work_modes.*.enabled" },
  llm_location: { label: "LLM: remote region or work authorization", gate: "C", lever: "work_modes.remote" },
  llm_visa: { label: "LLM: no sponsorship for hybrid or on-site", gate: "C", lever: "visa.unknown_policy" },
  all_providers_failed: { label: "All LLM providers failed, will retry", gate: "queue", lever: "(router)" },
  below_min_score: { label: "Below the minimum score", gate: "C", lever: "scoring.min_score" },
};

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return REASONS[code]?.label ?? code.replace(/_/g, " ");
}

export const STAGE_LABEL: Record<string, string> = {
  dropped_a: "Dropped (metadata)",
  dropped_b: "Dropped (description)",
  dropped_llm: "Dropped (LLM check)",
  below_score: "Below score",
  duplicate: "Duplicate",
  queued: "Queued",
  skipped_cap: "Waiting (cap)",
  llm_failed: "LLM failed, retry",
  matched: "Matched",
};
