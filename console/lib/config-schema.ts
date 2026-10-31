// Job Radar console: shape of the config document (mirror of jr_validate_config in radar_v2_schema.sql).
// Hand-written on purpose (guarded file). SQL guards budgets and invariants; this guards the full shape,
// compiles the JavaScript regexes (Postgres cannot), and turns zod issues into readable lines.
import { z } from "zod";

const text = z.string().trim().min(1, "must not be empty");
const textList = (max: number, min = 0) => z.array(text).min(min).max(max);
const https = z.string().regex(/^https:\/\/\S+$/, "must start with https://");
const jsRegex = z.string().min(1).refine((s) => {
  try {
    new RegExp(s, "i");
    return true;
  } catch {
    return false;
  }
}, "is not a valid JavaScript regex");

const toggle = z.strictObject({ enabled: z.boolean(), cadence: z.enum(["daily", "weekly"]).optional() });

const board = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]{2,40}$/, "2-40 lowercase letters, digits or dashes"),
  label: text.max(80),
  enabled: z.boolean(),
  cadence: z.enum(["daily", "weekly"]),
  max_items: z.int().min(1).max(60),
  detail: z.enum(["jina", "none"]),
  list_urls: z.array(https).min(1).max(6),
  job_url_regex: jsRegex,
});

const linkedinSearch = z.strictObject({
  keywords: text.max(120),
  location: text.max(80),
  work_types: z.array(z.enum(["remote", "hybrid", "onsite"])).min(1).max(3),
  experience: z.array(z.enum(["internship", "entry", "associate", "mid_senior", "director", "executive"])).max(6).optional(),
});

export const radarConfigSchema = z
  .strictObject({
    rev: text.max(80),
    profile: z.strictObject({
      headline: text.max(600),
      seniority: text.max(200),
      target_roles: textList(20, 1),
      skills: textList(60, 1),
      languages: z.record(z.string(), text),
      location: text.max(120),
      constraints: text.max(600),
    }),
    search: z.strictObject({
      role_terms: textList(200, 1),
      title_block_terms: textList(200),
      title_senior_regex: jsRegex,
      title_junior_regex: jsRegex,
      skills: textList(200, 1),
      min_skill_hits: z.int().min(0).max(10),
    }),
    experience: z.strictObject({
      max_years_required: z.int().min(0).max(10),
      unknown_policy: z.enum(["keep", "drop"]),
      seniority_ok: textList(20, 1),
    }),
    work_modes: z.strictObject({
      remote: z.strictObject({
        enabled: z.boolean(),
        regions_ok: textList(100),
        location_block: textList(200),
        desc_block: textList(200),
      }),
      hybrid: z.strictObject({ enabled: z.boolean(), require_visa: z.boolean() }),
      onsite: z.strictObject({ enabled: z.boolean(), require_visa: z.boolean() }),
      unknown_policy: z.enum(["keep", "drop"]),
    }),
    visa: z.strictObject({
      unknown_policy: z.enum(["keep", "drop"]),
      positive_terms: textList(200),
      negative_terms: textList(200),
      work_auth_terms: textList(200),
      known_sponsors: textList(300),
      target_countries: textList(60),
    }),
    languages: z.strictObject({
      blocked: textList(40),
      banned_phrases: textList(200),
      detect_jd_language: z.boolean(),
    }),
    opportunity: z.strictObject({
      jobs: z.boolean(),
      gigs: z.boolean(),
      employment_types: z
        .array(z.enum(["full_time", "part_time", "contract", "freelance", "internship", "unknown"]))
        .min(1)
        .max(6),
      block_phrases: textList(200).optional(), // commission only, revenue share, pay per meeting, partnerships
    }),
    freshness: z.strictObject({ window_days: z.int().min(1).max(30) }),
    llm: z.strictObject({
      slice_cap: z.int().min(1).max(60),
      detail_cap: z.int().min(0).max(80),
      max_per_source: z.int().min(1).max(60),
      pace_ms: z.int().min(4000).max(60000),
      max_desc_chars: z.int().min(1000).max(6000),
    }),
    scoring: z.strictObject({
      min_score: z.number().min(0).max(100),
      priority_score: z.number().min(0).max(100),
      weights: z.strictObject({
        match: z.number().min(0).max(1),
        filterFit: z.number().min(0).max(1),
        feasibility: z.number().min(0).max(1),
        recency: z.number().min(0).max(1),
      }),
    }),
    sources: z.strictObject({
      remotive: toggle,
      remoteok: toggle,
      arbeitnow: z.strictObject({ enabled: z.boolean(), visa_only: z.boolean() }),
      weworkremotely: toggle,
      "weworkremotely-mkt": toggle,
      "n8n-community": toggle,
      jobicy: toggle,
      "hn-whoishiring": toggle,
      himalayas: z.strictObject({
        enabled: z.boolean(),
        queries: z.array(z.strictObject({ q: text.max(80), seniority: text.max(40).optional() })).max(10),
      }),
      revopsroles: toggle,
      "clay-community": toggle,
      remocate: z.strictObject({ enabled: z.boolean(), categories: textList(10) }),
      "working-nomads": toggle,
      linkedin: z.strictObject({
        enabled: z.boolean(),
        mode: z.enum(["guest", "apify", "off"]),
        max_pages: z.int().min(1).max(3),
        detail: z.boolean(),
        searches: z.array(linkedinSearch).max(10),
      }),
      reddit: z.strictObject({
        enabled: z.boolean(),
        mode: z.enum(["tavily", "off"]),
        time_range: z.enum(["day", "week"]),
        max_queries: z.int().min(0).max(10),
        subreddits: textList(60),
        queries: textList(20),
      }),
      ats: z.strictObject({
        enabled: z.boolean(),
        max_per_company: z.int().min(1).max(100),
        companies: z
          .array(z.strictObject({ name: text.max(80), ats: z.enum(["greenhouse", "lever", "ashby"]), token: text.max(80) }))
          .max(60),
      }),
      boards: z.array(board).max(30),
    }),
  })
  .superRefine((c, ctx) => {
    const w = c.scoring.weights;
    const sum = w.match + w.filterFit + w.feasibility + w.recency;
    if (Math.abs(sum - 1) > 0.01) ctx.addIssue({ code: "custom", path: ["scoring", "weights"], message: `must add up to 1 (got ${sum.toFixed(3)})` });
    if (c.scoring.priority_score < c.scoring.min_score)
      ctx.addIssue({ code: "custom", path: ["scoring", "priority_score"], message: "must be >= min_score" });
    if (!c.work_modes.remote.enabled && !c.work_modes.hybrid.enabled && !c.work_modes.onsite.enabled)
      ctx.addIssue({ code: "custom", path: ["work_modes"], message: "enable at least one of remote, hybrid, onsite" });
    if (!c.opportunity.jobs && !c.opportunity.gigs)
      ctx.addIssue({ code: "custom", path: ["opportunity"], message: "enable jobs, gigs or both" });
    const li = c.sources.linkedin;
    if (li.searches.length * li.max_pages > 20)
      ctx.addIssue({ code: "custom", path: ["sources", "linkedin"], message: `searches x max_pages must stay <= 20 requests a run (got ${li.searches.length * li.max_pages})` });
    const keys = new Set<string>();
    let pages = 0;
    c.sources.boards.forEach((b, i) => {
      if (keys.has(b.key)) ctx.addIssue({ code: "custom", path: ["sources", "boards", i, "key"], message: `"${b.key}" is used twice` });
      keys.add(b.key);
      if (b.enabled) pages += b.list_urls.length;
    });
    if (pages > 30)
      ctx.addIssue({ code: "custom", path: ["sources", "boards"], message: `enabled boards may fetch 30 list pages a run at most (got ${pages})` });
  });

export type RadarConfig = z.infer<typeof radarConfigSchema>;

export type ParseResult = { ok: true; config: RadarConfig } | { ok: false; errors: string[] };

// Text from the editor -> typed config, or readable "path: message" lines for the toast.
export function parseConfigText(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [`invalid_json: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const r = radarConfigSchema.safeParse(data);
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    errors: r.error.issues.slice(0, 12).map((i) => `${i.path.length ? i.path.join(".") : "config"}: ${i.message}`),
  };
}
