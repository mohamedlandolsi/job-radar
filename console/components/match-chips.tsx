import { Star } from "lucide-react";
import type { Kind, MatchStatus } from "@/lib/radar";
import { KIND_CLASSES, KIND_LABEL, STATUS_CLASSES, STATUS_LABEL, visaInfo, workModeLabel } from "@/lib/match-display";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex h-6 max-w-full shrink-0 items-center rounded px-2 text-[0.8125rem] font-medium";
const PLAIN = "text-muted-foreground bg-secondary";

export function StatusChip({ status, className }: { status: MatchStatus; className?: string }) {
  return <span className={cn(CHIP, STATUS_CLASSES[status], className)}>{STATUS_LABEL[status]}</span>;
}

export function KindChip({ kind }: { kind: Kind }) {
  return <span className={cn(CHIP, KIND_CLASSES[kind])}>{KIND_LABEL[kind]}</span>;
}

export function WorkModeChip({ mode }: { mode: string | null }) {
  return <span className={cn(CHIP, PLAIN)}>{workModeLabel(mode)}</span>;
}

// Positive visa signals in green; refusals muted; "unknown" renders nothing unless showUnknown (detail page).
export function VisaChip({ status, showUnknown = false }: { status: string | null; showUnknown?: boolean }) {
  const v = visaInfo(status);
  if (v.tone === "hidden" && !showUnknown) return null;
  return (
    <span
      className={cn(
        CHIP,
        v.tone === "positive" ? "bg-state-approved-tint text-state-approved" : "bg-transparent text-ink-3 ring-1 ring-border ring-inset",
      )}
      title={v.label}
    >
      <span className="truncate">{v.label}</span>
    </span>
  );
}

export function PriorityStar({ priority }: { priority: boolean }) {
  if (!priority) return null;
  return (
    <span className="inline-flex shrink-0 text-star" title="Priority">
      <Star className="size-4 fill-current" aria-hidden />
      <span className="sr-only">Priority</span>
    </span>
  );
}
