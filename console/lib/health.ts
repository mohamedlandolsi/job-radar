// When the radar needs attention: one rule for the header chip and the Runs health card.
// Red: no run yet, the last run failed, or it is older than 36 hours.
import type { Health } from "@/lib/radar";

export const STALE_SECONDS = 36 * 3600;

export type HealthState = { red: boolean; reason: "no_run" | "failed" | "stale" | null };

export function healthState(h: Health | null): HealthState {
  if (!h || h.last_run_id === null || h.age_seconds === null) return { red: true, reason: "no_run" };
  if (h.last_status === "failed") return { red: true, reason: "failed" };
  if (h.age_seconds > STALE_SECONDS) return { red: true, reason: "stale" };
  return { red: false, reason: null };
}
