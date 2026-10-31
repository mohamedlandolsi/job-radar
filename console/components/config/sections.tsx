"use client";

import type { RadarConfig } from "@/lib/config-schema";
import { enumOptions, listMax, numLimits } from "@/lib/config-limits";
import { cn } from "@/lib/utils";
import { TagInput } from "@/components/form/tag-input";
import {
  CheckGroup,
  FieldError,
  KeyValueField,
  NumberField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
  regexError,
} from "@/components/form/fields";

type C = RadarConfig;
type Set = (next: C) => void;

const POLICY = enumOptions("experience.unknown_policy").map((v) => ({ value: v as "keep" | "drop", label: v === "keep" ? "Keep" : "Drop" }));
const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
  unknown: "Not stated",
};
type Employment = C["opportunity"]["employment_types"][number];
const EMPLOYMENT = enumOptions("opportunity.employment_types").map((v) => ({ value: v as Employment, label: EMPLOYMENT_LABEL[v] ?? v }));

// The config key under each field: the same names the Filtered screen shows as levers.
function Key({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      {children}
      <p className="font-mono text-[0.6875rem] text-ink-3">{path}</p>
    </div>
  );
}

function Tags({ path, label, values, onChange, mono = false }: { path: string; label: string; values: string[]; onChange: (v: string[]) => void; mono?: boolean }) {
  return (
    <Key path={path}>
      <TagInput label={label} values={values} max={listMax(path)} onChange={onChange} allowCommas mono={mono} placeholder="Type and press Enter" />
    </Key>
  );
}

function Num({ path, label, value, onChange, step, hint }: { path: string; label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  const l = numLimits(path);
  return (
    <Key path={path}>
      <NumberField label={label} value={value} onChange={onChange} min={l.min} max={l.max} integer={l.integer} step={step} hint={hint} />
    </Key>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <p className="text-[0.8125rem] font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function Section({ id, title, edited, summary, children }: { id: string; title: string; edited: boolean; summary: string; children: React.ReactNode }) {
  return (
    <details id={id} open className="group scroll-mt-20 rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{title}</span>
            {edited ? <span className="text-[0.75rem] font-semibold text-state-pending">edited</span> : null}
          </span>
          <span className="block text-[0.8125rem] text-ink-3 [overflow-wrap:anywhere]">{summary}</span>
        </span>
        <span aria-hidden className="mt-0.5 text-ink-3 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

export function ExperienceSection({ c, set }: { c: C; set: Set }) {
  const e = c.experience;
  const up = (p: Partial<C["experience"]>) => set({ ...c, experience: { ...e, ...p } });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Num path="experience.max_years_required" label="Max years of experience asked" value={e.max_years_required} onChange={(v) => up({ max_years_required: v })} hint="0 drops any stated minimum of 1 year or more" />
      <Key path="experience.unknown_policy">
        <SelectField label="No years stated" value={e.unknown_policy} options={POLICY} onChange={(v) => up({ unknown_policy: v })} />
      </Key>
      <div className="sm:col-span-2">
        <Tags path="experience.seniority_ok" label="Seniority levels that pass" values={e.seniority_ok} onChange={(v) => up({ seniority_ok: v })} />
      </div>
    </div>
  );
}

export function WorkModesSection({ c, set }: { c: C; set: Set }) {
  const w = c.work_modes;
  const v = c.visa;
  const upW = (p: Partial<C["work_modes"]>) => set({ ...c, work_modes: { ...w, ...p } });
  const upV = (p: Partial<C["visa"]>) => set({ ...c, visa: { ...v, ...p } });
  const noMode = !w.remote.enabled && !w.hybrid.enabled && !w.onsite.enabled;
  return (
    <div className="space-y-4">
      <Group title="Remote">
        <Key path="work_modes.remote.enabled">
          <SwitchField label="Remote jobs" checked={w.remote.enabled} onChange={(x) => upW({ remote: { ...w.remote, enabled: x } })} />
        </Key>
        <Tags path="work_modes.remote.regions_ok" label="Regions that pass" values={w.remote.regions_ok} onChange={(x) => upW({ remote: { ...w.remote, regions_ok: x } })} />
        <Tags path="work_modes.remote.location_block" label="Blocked locations" values={w.remote.location_block} onChange={(x) => upW({ remote: { ...w.remote, location_block: x } })} />
        <Tags path="work_modes.remote.desc_block" label="Blocked phrases in the description" values={w.remote.desc_block} onChange={(x) => upW({ remote: { ...w.remote, desc_block: x } })} />
      </Group>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["hybrid", "onsite"] as const).map((m) => (
          <Group key={m} title={m === "hybrid" ? "Hybrid" : "On-site"}>
            <Key path={`work_modes.${m}.enabled`}>
              <SwitchField label={m === "hybrid" ? "Hybrid jobs" : "On-site jobs"} checked={w[m].enabled} onChange={(x) => upW({ [m]: { ...w[m], enabled: x } })} />
            </Key>
            <Key path={`work_modes.${m}.require_visa`}>
              <SwitchField label="Only with a visa signal" hint="Sponsorship or relocation phrase, source flag or known sponsor" checked={w[m].require_visa} onChange={(x) => upW({ [m]: { ...w[m], require_visa: x } })} />
            </Key>
          </Group>
        ))}
      </div>
      {noMode ? <FieldError>Enable at least one of remote, hybrid, on-site</FieldError> : null}
      <Key path="work_modes.unknown_policy">
        <SelectField label="Work mode not stated" value={w.unknown_policy} options={POLICY} onChange={(x) => upW({ unknown_policy: x })} />
      </Key>
      <Group title="Visa">
        <Key path="visa.unknown_policy">
          <SelectField label="Hybrid or on-site with no visa signal" value={v.unknown_policy} options={POLICY} onChange={(x) => upV({ unknown_policy: x })} />
        </Key>
        <Tags path="visa.positive_terms" label="Phrases that mean sponsorship or relocation" values={v.positive_terms} onChange={(x) => upV({ positive_terms: x })} />
        <Tags path="visa.negative_terms" label="Phrases that refuse sponsorship" values={v.negative_terms} onChange={(x) => upV({ negative_terms: x })} />
        <Tags path="visa.work_auth_terms" label="Phrases that need existing work authorization" values={v.work_auth_terms} onChange={(x) => upV({ work_auth_terms: x })} />
        <Tags path="visa.known_sponsors" label="Known sponsors (companies)" values={v.known_sponsors} onChange={(x) => upV({ known_sponsors: x })} />
        <Tags path="visa.target_countries" label="Target countries (empty: any)" values={v.target_countries} onChange={(x) => upV({ target_countries: x })} />
      </Group>
    </div>
  );
}

export function SearchSection({ c, set }: { c: C; set: Set }) {
  const s = c.search;
  const up = (p: Partial<C["search"]>) => set({ ...c, search: { ...s, ...p } });
  return (
    <div className="space-y-4">
      <Tags path="search.role_terms" label="Role terms (title or description)" values={s.role_terms} onChange={(v) => up({ role_terms: v })} />
      <Tags path="search.title_block_terms" label="Blocked title words" values={s.title_block_terms} onChange={(v) => up({ title_block_terms: v })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Key path="search.title_senior_regex">
          <TextField label="Senior title regex" mono value={s.title_senior_regex} onChange={(v) => up({ title_senior_regex: v })} error={regexError(s.title_senior_regex)} />
        </Key>
        <Key path="search.title_junior_regex">
          <TextField label="Junior title regex" mono value={s.title_junior_regex} onChange={(v) => up({ title_junior_regex: v })} error={regexError(s.title_junior_regex)} />
        </Key>
      </div>
      <Tags path="search.skills" label="Skills to look for" values={s.skills} onChange={(v) => up({ skills: v })} />
      <div className="sm:w-1/2">
        <Num path="search.min_skill_hits" label="Minimum skill hits" value={s.min_skill_hits} onChange={(v) => up({ min_skill_hits: v })} />
      </div>
    </div>
  );
}

export function LanguagesSection({ c, set }: { c: C; set: Set }) {
  const l = c.languages;
  const up = (p: Partial<C["languages"]>) => set({ ...c, languages: { ...l, ...p } });
  return (
    <div className="space-y-4">
      <Tags path="languages.blocked" label="Blocked languages" values={l.blocked} onChange={(v) => up({ blocked: v })} />
      <Tags path="languages.banned_phrases" label="Banned phrases" values={l.banned_phrases} onChange={(v) => up({ banned_phrases: v })} />
      <Key path="languages.detect_jd_language">
        <SwitchField label="Detect descriptions written in a blocked language" checked={l.detect_jd_language} onChange={(v) => up({ detect_jd_language: v })} />
      </Key>
    </div>
  );
}

export function OpportunitySection({ c, set, base }: { c: C; set: Set; base: C }) {
  const o = c.opportunity;
  const up = (p: Partial<C["opportunity"]>) => set({ ...c, opportunity: { ...o, ...p } });
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Key path="opportunity.jobs">
          <SwitchField label="Jobs" checked={o.jobs} onChange={(v) => up({ jobs: v })} />
        </Key>
        <Key path="opportunity.gigs">
          <SwitchField label="Gigs (freelance, Reddit)" checked={o.gigs} onChange={(v) => up({ gigs: v })} />
        </Key>
      </div>
      {!o.jobs && !o.gigs ? <FieldError>Enable jobs, gigs or both</FieldError> : null}
      <Key path="opportunity.employment_types">
        <CheckGroup
          label="Employment types"
          options={EMPLOYMENT}
          values={o.employment_types}
          onChange={(v) => up({ employment_types: v })}
          error={o.employment_types.length ? null : "Pick at least one"}
        />
      </Key>
      <Tags
        path="opportunity.block_phrases"
        label="Unpaid or commission phrases to drop"
        values={o.block_phrases ?? []}
        // Optional key: keep it absent when it was absent and stays empty, so the saved document does not change shape.
        onChange={(v) => up({ block_phrases: v.length || base.opportunity.block_phrases !== undefined ? v : undefined })}
      />
    </div>
  );
}

export function BudgetSection({ c, set }: { c: C; set: Set }) {
  const l = c.llm;
  const upL = (p: Partial<C["llm"]>) => set({ ...c, llm: { ...l, ...p } });
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Num path="freshness.window_days" label="Freshness window (days)" value={c.freshness.window_days} onChange={(v) => set({ ...c, freshness: { window_days: v } })} />
      <Num path="llm.slice_cap" label="LLM calls per run" value={l.slice_cap} onChange={(v) => upL({ slice_cap: v })} hint="The best postings go first; the rest wait for the next run" />
      <Num path="llm.detail_cap" label="Description fetches per run" value={l.detail_cap} onChange={(v) => upL({ detail_cap: v })} />
      <Num path="llm.max_per_source" label="LLM calls per source" value={l.max_per_source} onChange={(v) => upL({ max_per_source: v })} />
      <Num path="llm.pace_ms" label="Pause between LLM calls (ms)" value={l.pace_ms} onChange={(v) => upL({ pace_ms: v })} step={500} hint="Groq free tier: 15000 keeps under 8K tokens a minute" />
      <Num path="llm.max_desc_chars" label="Description characters sent" value={l.max_desc_chars} onChange={(v) => upL({ max_desc_chars: v })} step={100} />
    </div>
  );
}

const WEIGHTS = [
  { key: "match", label: "Role match" },
  { key: "filterFit", label: "Filter fit" },
  { key: "feasibility", label: "Feasibility" },
  { key: "recency", label: "Recency" },
] as const;

export function weightSum(c: C): number {
  const w = c.scoring.weights;
  return [w.match, w.filterFit, w.feasibility, w.recency].reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

export function ScoringSection({ c, set }: { c: C; set: Set }) {
  const s = c.scoring;
  const up = (p: Partial<C["scoring"]>) => set({ ...c, scoring: { ...s, ...p } });
  const sum = weightSum(c);
  const sumOk = Math.abs(sum - 1) <= 0.01;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Num path="scoring.min_score" label="Minimum score for a match" value={s.min_score} onChange={(v) => up({ min_score: v })} />
        <Num path="scoring.priority_score" label="Priority score (star)" value={s.priority_score} onChange={(v) => up({ priority_score: v })} />
      </div>
      {s.priority_score < s.min_score ? <FieldError>The priority score must be at least the minimum score</FieldError> : null}
      <Group title="Weights">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {WEIGHTS.map((w) => (
            <Num
              key={w.key}
              path={`scoring.weights.${w.key}`}
              label={w.label}
              value={s.weights[w.key]}
              step={0.05}
              onChange={(v) => up({ weights: { ...s.weights, [w.key]: v } })}
            />
          ))}
        </div>
        <p
          className={cn("tabular text-[0.9375rem]", sumOk ? "text-muted-foreground" : "font-semibold text-danger")}
          role="status"
          aria-live="polite"
        >
          Sum {sum.toFixed(2)} {sumOk ? "(ok)" : "(must be 1.00)"}
        </p>
      </Group>
    </div>
  );
}

export function ProfileSection({ c, set }: { c: C; set: Set }) {
  const p = c.profile;
  const up = (x: Partial<C["profile"]>) => set({ ...c, profile: { ...p, ...x } });
  return (
    <div className="space-y-4">
      <Key path="profile.headline">
        <TextAreaField label="Headline" value={p.headline} maxLength={600} rows={4} onChange={(v) => up({ headline: v })} />
      </Key>
      <div className="grid gap-4 sm:grid-cols-2">
        <Key path="profile.seniority">
          <TextField label="Seniority" value={p.seniority} maxLength={200} onChange={(v) => up({ seniority: v })} error={p.seniority.trim() ? null : "Required"} />
        </Key>
        <Key path="profile.location">
          <TextField label="Location" value={p.location} maxLength={120} onChange={(v) => up({ location: v })} error={p.location.trim() ? null : "Required"} />
        </Key>
      </div>
      <Tags path="profile.target_roles" label="Target roles" values={p.target_roles} onChange={(v) => up({ target_roles: v })} />
      <Tags path="profile.skills" label="Skills" values={p.skills} onChange={(v) => up({ skills: v })} />
      <Key path="profile.languages">
        <KeyValueField label="Languages" keyLabel="Language" valueLabel="Level" value={p.languages} onChange={(v) => up({ languages: v })} />
      </Key>
      <Key path="profile.constraints">
        <TextAreaField label="Constraints" value={p.constraints} maxLength={600} rows={3} onChange={(v) => up({ constraints: v })} />
      </Key>
    </div>
  );
}
