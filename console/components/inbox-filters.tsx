import Link from "next/link";
import type { Count, InboxCounts, Kind } from "@/lib/radar";
import { workModeLabel } from "@/lib/match-display";
import { SegmentedLinks } from "@/components/segmented-links";
import { cn } from "@/lib/utils";

export type InboxQuery = { kind: Kind; mode?: string; source?: string };

// Builds a Today URL; switching tabs drops the chip filters (their counts belong to the other tab).
export function inboxHref(q: InboxQuery): string {
  const p = new URLSearchParams();
  if (q.kind !== "job") p.set("kind", q.kind);
  if (q.mode) p.set("mode", q.mode);
  if (q.source) p.set("source", q.source);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground sm:h-8",
        active ? "border-foreground bg-foreground text-background" : "bg-card hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined ? <span className={cn("tabular", active ? "opacity-80" : "text-ink-3")}>{count}</span> : null}
    </Link>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.8125rem] font-medium text-ink-3">{label}</span>
      {children}
    </div>
  );
}

const MODES = ["remote", "hybrid", "onsite"] as const;

export function InboxFilters({ q, counts }: { q: InboxQuery; counts: InboxCounts }) {
  const modeCount = (m: string) => counts.modes.find((c) => c.value === m)?.count ?? 0;
  // The three modes always show; "unknown" only when some match has it.
  const modes: Count[] = [
    ...MODES.map((m) => ({ value: m, count: modeCount(m) })),
    ...counts.modes.filter((c) => !(MODES as readonly string[]).includes(c.value)),
  ];
  const sources = q.source && !counts.sources.some((s) => s.value === q.source)
    ? [...counts.sources, { value: q.source, count: 0 }]
    : counts.sources;

  return (
    <div className="space-y-3">
      <SegmentedLinks
        label="Kind"
        items={[
          { href: inboxHref({ kind: "job" }), label: "Jobs", count: counts.job, active: q.kind === "job" },
          { href: inboxHref({ kind: "gig" }), label: "Gigs", count: counts.gig, active: q.kind === "gig" },
        ]}
      />
      <ChipRow label="Mode">
        <Chip href={inboxHref({ ...q, mode: undefined })} active={!q.mode} label="All" />
        {modes.map((m) => (
          <Chip
            key={m.value}
            href={inboxHref({ ...q, mode: q.mode === m.value ? undefined : m.value })}
            active={q.mode === m.value}
            label={workModeLabel(m.value)}
            count={m.count}
          />
        ))}
      </ChipRow>
      {sources.length > 0 ? (
        <ChipRow label="Source">
          <Chip href={inboxHref({ ...q, source: undefined })} active={!q.source} label="All" />
          {sources.map((s) => (
            <Chip
              key={s.value}
              href={inboxHref({ ...q, source: q.source === s.value ? undefined : s.value })}
              active={q.source === s.value}
              label={s.value}
              count={s.count}
            />
          ))}
        </ChipRow>
      ) : null}
    </div>
  );
}
