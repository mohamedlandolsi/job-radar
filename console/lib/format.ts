// Pure formatting helpers. Safe to import from Server and Client Components.

// 42 -> "just now", 300 -> "5 min ago", 7200 -> "2 h ago", 172800 -> "2 d ago"
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  return formatAge((Date.now() - t) / 1000);
}

// "match=80; fit=72; feas=90; rec=100" -> [{ key: "match", value: 80 }, ...]. Malformed parts are skipped.
// Written by n8n/16_gate_score.js into jr_matches.score_breakdown.
export function parseBreakdown(text: string | null): { key: string; value: number }[] {
  if (!text) return [];
  return text
    .split(";")
    .map((part) => part.split("="))
    .filter((kv) => kv.length === 2 && kv[0].trim() !== "" && Number.isFinite(Number(kv[1].trim())))
    .map(([k, v]) => ({ key: k.trim(), value: Number(v.trim()) }));
}

// Human labels for score_breakdown keys (scoring.weights: match, filterFit, feasibility, recency); unknown keys show as-is.
export const FACTOR_LABELS: Record<string, string> = {
  match: "Role match",
  fit: "Filter fit",
  feas: "Feasibility",
  rec: "Recency",
};

// Only render links that are plain web URLs (data comes from scrapers and LLM output).
export function httpUrl(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}
