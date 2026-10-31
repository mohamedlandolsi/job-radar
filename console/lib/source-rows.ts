// Sources screen rows: one per key in config.sources (and per board), joined to 7-day health.
// Pure: safe to import from Server and Client Components.
import type { RadarConfig } from "@/lib/config-schema";
import type { SourceHealth } from "@/lib/radar";

export type SourceKind = "v1" | "linkedin" | "reddit" | "ats" | "board";
export type Dot = "green" | "amber" | "red" | "off";

export type SourceRow = {
  key: string; // config key (board key for boards); also the source_stats key the engine writes
  label: string;
  kind: SourceKind;
  enabled: boolean;
  cadence: string; // "daily" | "weekly" | "every run"
  health: SourceHealth | null;
  dot: Dot;
};

export const V1_LABELS: Record<string, string> = {
  remotive: "Remotive",
  remoteok: "RemoteOK",
  arbeitnow: "Arbeitnow (visa flag)",
  weworkremotely: "We Work Remotely (programming)",
  "weworkremotely-mkt": "We Work Remotely (sales and marketing)",
  "n8n-community": "n8n Community jobs",
  jobicy: "Jobicy",
  "hn-whoishiring": "HN Who is Hiring",
  himalayas: "Himalayas",
  revopsroles: "RevOps Roles",
  "clay-community": "Clay Community",
  remocate: "Remocate",
  "working-nomads": "Working Nomads",
  linkedin: "LinkedIn (guest search)",
  reddit: "Reddit (through Tavily)",
  ats: "ATS watchlist (Greenhouse, Lever, Ashby)",
};

const KIND: Record<string, SourceKind> = { linkedin: "linkedin", reddit: "reddit", ats: "ats" };

// Off when disabled; otherwise red with nothing fetched in 7 days, amber with errors, green when clean.
export function healthDot(enabled: boolean, h: SourceHealth | null): Dot {
  if (!enabled) return "off";
  if (!h || h.fetched <= 0) return "red";
  return h.errors > 0 ? "amber" : "green";
}

export function buildSourceRows(cfg: RadarConfig, health: SourceHealth[]): { rows: SourceRow[]; unknown: SourceHealth[] } {
  const byKey = new Map(health.map((h) => [h.source, h]));
  const rows: SourceRow[] = [];
  for (const [key, value] of Object.entries(cfg.sources)) {
    if (key === "boards") continue;
    const v = value as { enabled: boolean; cadence?: string };
    const kind = KIND[key] ?? "v1";
    const h = byKey.get(key) ?? null;
    rows.push({
      key,
      label: V1_LABELS[key] ?? key,
      kind,
      enabled: v.enabled,
      cadence: kind === "v1" ? (v.cadence ?? "daily") : "every run",
      health: h,
      dot: healthDot(v.enabled, h),
    });
  }
  for (const b of cfg.sources.boards) {
    const h = byKey.get(b.key) ?? null;
    rows.push({ key: b.key, label: b.label, kind: "board", enabled: b.enabled, cadence: b.cadence, health: h, dot: healthDot(b.enabled, h) });
  }
  const known = new Set(rows.map((r) => r.key));
  return { rows, unknown: health.filter((h) => !known.has(h.source)) };
}
