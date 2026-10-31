// URL helpers for /filtered. Pure: safe to import from Server and Client Components.
export type DroppedQuery = { stage?: string; reason?: string; source?: string; flagged?: boolean };

export function filteredHref(q: DroppedQuery): string {
  const p = new URLSearchParams();
  if (q.stage) p.set("stage", q.stage);
  if (q.reason) p.set("reason", q.reason);
  if (q.source) p.set("source", q.source);
  if (q.flagged) p.set("flagged", "1");
  const s = p.toString();
  return s ? `/filtered?${s}#dropped` : "/filtered#dropped";
}
