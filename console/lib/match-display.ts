// Display helpers for matches. Pure: safe to import from Server and Client Components.
// The verdict state machine mirrors jr_review() in sql/radar_v2_schema.sql (the database still enforces it).
import type { Kind, MatchStatus } from "@/lib/radar";

export const STATUS_LABEL: Record<MatchStatus, string> = {
  new: "New",
  good: "Good fit",
  false_positive: "Not a fit",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

// Text on tint. new amber, good green, applied blue, interviewing violet, offer emerald, rejected gray,
// false_positive gray with strikethrough (console/CLAUDE.md).
export const STATUS_CLASSES: Record<MatchStatus, string> = {
  new: "text-state-pending bg-state-pending-tint",
  good: "text-state-approved bg-state-approved-tint",
  applied: "text-state-edited bg-state-edited-tint",
  interviewing: "text-state-sent bg-state-sent-tint",
  offer: "text-match-offer bg-match-offer-tint",
  rejected: "text-state-rejected bg-state-rejected-tint",
  false_positive: "text-state-superseded line-through",
};

export const KIND_LABEL: Record<Kind, string> = { job: "Job", gig: "Gig" };
export const KIND_CLASSES: Record<Kind, string> = {
  job: "text-kind-job bg-kind-job-tint",
  gig: "text-kind-gig bg-kind-gig-tint",
};

// Verdicts: the action sent to reviewMatch() and the button text.
export type Verdict = "good" | "false_positive" | "applied" | "interviewing" | "offer" | "rejected" | "reopen";

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: "Good fit",
  false_positive: "Not a fit",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  reopen: "Reopen",
};

// Toast titles after a successful verdict.
export const VERDICT_DONE: Record<Verdict, string> = {
  good: "Marked as a good fit",
  false_positive: "Marked as not a fit",
  applied: "Marked as applied",
  interviewing: "Moved to interviewing",
  offer: "Marked as an offer",
  rejected: "Marked as rejected",
  reopen: "Reopened",
};

export const ALLOWED_VERDICTS: Record<MatchStatus, Verdict[]> = {
  new: ["good", "false_positive", "applied"],
  good: ["applied", "false_positive", "reopen"],
  false_positive: ["good", "reopen"],
  applied: ["interviewing", "offer", "rejected"],
  interviewing: ["offer", "rejected"],
  offer: [],
  rejected: [],
};

export const WORK_MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Mode unknown",
};

export function workModeLabel(mode: string | null): string {
  return WORK_MODE_LABEL[mode ?? "unknown"] ?? mode ?? "Mode unknown";
}

// visa_status from n8n/16_gate_score.js: sponsors | relocation_support | no_sponsorship | work_auth_required
// | unknown | "signal:<evidence>". tone: positive (green chip), muted (gray chip), hidden (no chip on cards).
export type VisaInfo = { label: string; tone: "positive" | "muted" | "hidden"; evidence?: string };

export function visaInfo(status: string | null): VisaInfo {
  const s = (status ?? "unknown").trim();
  if (s.toLowerCase().startsWith("signal:")) {
    const evidence = s.slice("signal:".length).trim();
    return { label: evidence ? `Signal: ${evidence}` : "Visa signal", tone: "positive", evidence };
  }
  switch (s.toLowerCase()) {
    case "sponsors":
      return { label: "Sponsors visa", tone: "positive" };
    case "relocation_support":
      return { label: "Relocation", tone: "positive" };
    case "no_sponsorship":
      return { label: "No sponsorship", tone: "muted" };
    case "work_auth_required":
      return { label: "Work authorization required", tone: "muted" };
    case "":
    case "unknown":
    case "n/a":
      return { label: "Visa not stated", tone: "hidden" };
    default:
      return { label: s.replace(/_/g, " "), tone: "muted" };
  }
}

// 0 -> "0 yrs", 0.5 -> "0.5 yrs", 1 -> "1 yr", 3 -> "3 yrs", null -> "not stated"
export function yearsLabel(years: number | null): string {
  if (years == null || !Number.isFinite(years)) return "not stated";
  const n = Math.round(years * 10) / 10;
  return `${n} ${n === 1 ? "yr" : "yrs"}`;
}

// 0 -> "today", 1 -> "1 d", 12 -> "12 d"
export function ageLabel(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return "";
  return days <= 0 ? "today" : `${days} d`;
}
