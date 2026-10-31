// Formatting for the Runs screen. Pure: safe to import from Server and Client Components.

// jr_should_run counts runs per day in Africa/Tunis (the laptop's schedule zone).
export const RADAR_TZ = "Africa/Tunis";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: RADAR_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: RADAR_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export function radarDay(iso: string | Date): string {
  return dayFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

// "31 Oct, 09:12" in Africa/Tunis.
export function radarTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

// Completed runs that started today (Africa/Tunis): jr_should_run allows a requested run while this is < 3.
export function completedToday(runs: { status: string; started_at: string }[], now: Date = new Date()): number {
  const today = radarDay(now);
  return runs.filter((r) => r.status === "completed" && radarDay(r.started_at) === today).length;
}

// 45 -> "45 s", 845 -> "14 min 05 s", 3720 -> "1 h 02 min"
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "-";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

// jr_runs.providers: one entry per LLM item, comma separated ("groq-gptoss,gemini,none,deferred").
// "none" = every provider failed, "deferred" = over the cap or the time budget (back in the queue).
export function providerSummary(providers: string | null): { label: string; count: number; kind: "provider" | "failed" | "deferred" }[] {
  const counts = new Map<string, number>();
  for (const raw of (providers ?? "").split(",")) {
    const p = raw.trim();
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const kind = (p: string) => (p === "none" ? "failed" : p === "deferred" ? "deferred" : "provider");
  return [...counts]
    .map(([p, count]) => ({ label: p === "none" ? "failed" : p, count, kind: kind(p) as "provider" | "failed" | "deferred" }))
    .sort((a, b) => Number(a.kind !== "provider") - Number(b.kind !== "provider") || b.count - a.count || a.label.localeCompare(b.label));
}

export const FUNNEL_KEYS = ["fetched", "gate_a_pass", "new_or_retry", "detail_ok", "gate_b_pass", "llm_calls", "matches"] as const;
export const FUNNEL_SHORT: Record<(typeof FUNNEL_KEYS)[number], string> = {
  fetched: "fetched",
  gate_a_pass: "gate A",
  new_or_retry: "new",
  detail_ok: "detail",
  gate_b_pass: "gate B",
  llm_calls: "LLM",
  matches: "matches",
};

// jr_should_run honours a request for 24 hours (and jr_start_run clears it when a run starts).
export const REQUEST_TTL_MS = 24 * 3600 * 1000;
export function requestPending(requestedAt: string | null, now: number = Date.now()): boolean {
  if (!requestedAt) return false;
  const age = now - Date.parse(requestedAt);
  return Number.isFinite(age) && age >= 0 && age < REQUEST_TTL_MS;
}
