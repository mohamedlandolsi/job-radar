"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseConfigText, type RadarConfig } from "@/lib/config-schema";
import { nextRev } from "@/lib/next-rev";
import { cn } from "@/lib/utils";
import { ConfigSaveBar, type SaveSource } from "@/components/form/config-save-bar";
import { JsonTab } from "@/components/config/json-tab";
import {
  BudgetSection,
  ExperienceSection,
  LanguagesSection,
  OpportunitySection,
  ProfileSection,
  ScoringSection,
  SearchSection,
  Section,
  WorkModesSection,
  weightSum,
} from "@/components/config/sections";

type C = RadarConfig;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const on = (b: boolean) => (b ? "on" : "off");

// Guide A5 order. keys: the config sections each form section edits.
const SECTIONS: { id: string; title: string; keys: (keyof C)[]; summary: (c: C) => string; render: (c: C, set: (n: C) => void, base: C) => React.ReactNode }[] = [
  {
    id: "experience",
    title: "Experience",
    keys: ["experience"],
    summary: (c) => `Max ${c.experience.max_years_required} years asked, not stated: ${c.experience.unknown_policy}`,
    render: (c, set) => <ExperienceSection c={c} set={set} />,
  },
  {
    id: "work-modes",
    title: "Work modes and visa",
    keys: ["work_modes", "visa"],
    summary: (c) =>
      `Remote ${on(c.work_modes.remote.enabled)}, hybrid ${on(c.work_modes.hybrid.enabled)}${c.work_modes.hybrid.require_visa ? " (visa)" : ""}, on-site ${on(c.work_modes.onsite.enabled)}${c.work_modes.onsite.require_visa ? " (visa)" : ""}, ${c.visa.known_sponsors.length} known sponsors`,
    render: (c, set) => <WorkModesSection c={c} set={set} />,
  },
  {
    id: "search",
    title: "Search",
    keys: ["search"],
    summary: (c) => `${c.search.role_terms.length} role terms, ${c.search.title_block_terms.length} blocked title words, ${c.search.skills.length} skills, at least ${c.search.min_skill_hits} hits`,
    render: (c, set) => <SearchSection c={c} set={set} />,
  },
  {
    id: "languages",
    title: "Languages",
    keys: ["languages"],
    summary: (c) => `${c.languages.blocked.length} blocked languages, ${c.languages.banned_phrases.length} banned phrases`,
    render: (c, set) => <LanguagesSection c={c} set={set} />,
  },
  {
    id: "opportunity",
    title: "Opportunity",
    keys: ["opportunity"],
    summary: (c) => `Jobs ${on(c.opportunity.jobs)}, gigs ${on(c.opportunity.gigs)}, ${c.opportunity.employment_types.length} employment types`,
    render: (c, set, base) => <OpportunitySection c={c} set={set} base={base} />,
  },
  {
    id: "budget",
    title: "Freshness and budget",
    keys: ["freshness", "llm"],
    summary: (c) => `${c.freshness.window_days} day window, ${c.llm.slice_cap} LLM calls, ${c.llm.detail_cap} detail fetches, ${c.llm.pace_ms / 1000} s pace`,
    render: (c, set) => <BudgetSection c={c} set={set} />,
  },
  {
    id: "scoring",
    title: "Scoring",
    keys: ["scoring"],
    summary: (c) => `Min ${c.scoring.min_score}, priority ${c.scoring.priority_score}, weights sum ${weightSum(c).toFixed(2)}`,
    render: (c, set) => <ScoringSection c={c} set={set} />,
  },
  {
    id: "profile",
    title: "Profile",
    keys: ["profile"],
    summary: (c) => `${c.profile.target_roles.length} target roles, ${c.profile.skills.length} skills, ${c.profile.location}`,
    render: (c, set) => <ProfileSection c={c} set={set} />,
  },
];

type Mode = "form" | "json";

// Form and Advanced JSON share one draft; Versions is a separate server-rendered tab.
export function ConfigEditor({ active, initialMode }: { active: { rev: string; payload: C }; initialMode: Mode }) {
  const router = useRouter();
  const base = active.payload;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<C>(() => clone(base));
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(base, null, 2));
  const [switchError, setSwitchError] = useState<string[] | null>(null);
  const [resetCount, setResetCount] = useState(0);

  // The JSON as an object, when it parses (used for "what changed" while on the JSON tab).
  const jsonObject = useMemo(() => {
    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [jsonText]);

  const current: Record<string, unknown> | null = mode === "form" ? (draft as unknown as Record<string, unknown>) : jsonObject;
  const changedKeys = useMemo(() => {
    if (!current) return ["(invalid JSON)"];
    const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
    keys.delete("rev");
    return [...keys].filter((k) => !same((base as unknown as Record<string, unknown>)[k], current[k]));
  }, [current, base]);
  const dirty = changedKeys.length > 0;

  const suggestedRev = useMemo(() => nextRev(active.rev), [active.rev]);
  const source: SaveSource = useMemo(() => (mode === "form" ? { draft } : { text: jsonText }), [mode, draft, jsonText]);

  function toJson() {
    setJsonText(JSON.stringify(draft, null, 2));
    setSwitchError(null);
    setMode("json");
  }

  function toForm() {
    const r = parseConfigText(jsonText);
    if (!r.ok) {
      setSwitchError(r.errors);
      return;
    }
    // Keep the key order of the text (the zod result reorders keys to the schema order).
    setDraft(JSON.parse(jsonText) as C);
    setSwitchError(null);
    setMode("form");
  }

  function discard() {
    setDraft(clone(base));
    setJsonText(JSON.stringify(base, null, 2));
    setSwitchError(null);
    setResetCount((n) => n + 1);
  }

  function goVersions() {
    if (dirty && !window.confirm("Leave the editor? Your unsaved changes will be lost.")) return;
    router.push("/config?tab=versions");
  }

  const tab = (m: Mode | "versions", label: string, onClick: () => void, short?: string) => {
    const activeTab = m === mode;
    return (
      <button
        type="button"
        role="tab"
        aria-label={label}
        aria-selected={activeTab}
        onClick={onClick}
        className={cn(
          "flex h-11 items-center justify-center rounded border border-transparent px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground sm:h-8",
          activeTab && "border-border bg-card text-foreground",
        )}
      >
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </button>
    );
  };

  return (
    <div className={cn("space-y-4", dirty && "pb-72 sm:pb-44")}>
      <div role="tablist" aria-label="Config views" className="grid grid-cols-3 gap-1 rounded-md bg-secondary p-1 sm:flex sm:w-fit">
        {tab("form", "Form", () => (mode === "json" ? toForm() : undefined))}
        {tab("json", "Advanced JSON", () => (mode === "form" ? toJson() : undefined), "JSON")}
        {tab("versions", "Versions", goVersions)}
      </div>

      {switchError ? (
        <div role="alert" className="rounded-md border border-danger bg-danger-tint p-3 text-[0.8125rem] text-danger">
          <p className="font-semibold">Fix the JSON before going back to the form:</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[0.75rem]">
            {switchError.map((e) => (
              <li key={e} className="[overflow-wrap:anywhere]">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "form" ? (
        <div key={resetCount} className="space-y-3">
          {SECTIONS.map((s) => (
            <Section key={s.id} id={s.id} title={s.title} summary={s.summary(draft)} edited={s.keys.some((k) => !same(draft[k], base[k]))}>
              {s.render(draft, setDraft, base)}
            </Section>
          ))}
          <p className="text-[0.8125rem] text-ink-3">Sources are edited on the Sources screen (or here in Advanced JSON).</p>
        </div>
      ) : (
        <JsonTab key={resetCount} text={jsonText} onChange={setJsonText} />
      )}

      {dirty ? (
        <ConfigSaveBar
          key={suggestedRev}
          source={source}
          baseRev={active.rev}
          summary={`Changed: ${changedKeys.join(", ")}`}
          defaultNote=""
          noteRequired
          suggestedRev={suggestedRev}
          onDiscard={discard}
          revHint={mode === "json" ? "The rev inside the JSON is replaced by New rev." : undefined}
        />
      ) : null}
    </div>
  );
}
