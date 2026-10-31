import Link from "next/link";
import type { ConfigVersion, ConfigVersionSummary } from "@/lib/radar";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfigDiff } from "@/components/config-diff";
import { RestoreBar } from "@/components/config/restore-bar";

// Same layout for both sides of a diff: formatting differences (compact vs indented saves) are not changes.
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const href = (p: { a?: number; b?: number; restore?: number }) => {
  const q = new URLSearchParams({ tab: "versions" });
  if (p.a) q.set("a", String(p.a));
  if (p.b) q.set("b", String(p.b));
  if (p.restore) q.set("restore", String(p.restore));
  return `/config?${q.toString()}`;
};

function Pick({ label, on, to }: { label: string; on: boolean; to: string }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-current={on ? "true" : undefined}
      aria-label={`Compare: set ${label}`}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md border text-[0.8125rem] font-semibold sm:size-8",
        on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

// Versions tab: last revs, a diff between two picked revs, and "Restore as new rev".
export function Versions({
  versions,
  a,
  b,
  restore,
  activeText,
  activeRev,
}: {
  versions: ConfigVersionSummary[];
  a: ConfigVersion | null;
  b: ConfigVersion | null;
  restore: ConfigVersion | null;
  activeText: string;
  activeRev: string;
}) {
  return (
    <div className={cn("space-y-6", restore && "pb-72 sm:pb-44")}>
      {restore ? (
        <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Restore">
          <h2 className="font-semibold">Restore {restore.rev} as a new rev</h2>
          <p className="text-[0.8125rem] text-ink-3">
            Saved {timeAgo(restore.created_at)} by {restore.created_by}
            {restore.note ? `: ${restore.note}` : ""}. Below: what changes compared with the active rev {activeRev}.
          </p>
          <ConfigDiff before={pretty(activeText)} after={pretty(restore.payload_text)} />
          <RestoreBar text={restore.payload_text} oldRev={restore.rev} activeRev={activeRev} />
        </section>
      ) : null}

      <section className="space-y-2" aria-label="Versions">
        <p className="text-[0.8125rem] text-ink-3">Last {versions.length} revs, newest first. Pick A and B to compare.</p>
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {versions.map((v) => (
            <li key={v.id} data-rev={v.rev} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="flex gap-1.5">
                <Pick label="A" on={a?.id === v.id} to={href({ a: v.id, b: b?.id })} />
                <Pick label="B" on={b?.id === v.id} to={href({ a: a?.id, b: v.id })} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[0.8125rem] font-semibold [overflow-wrap:anywhere]">{v.rev}</span>
                  {v.active ? <span className="text-[0.75rem] font-semibold text-state-approved">active</span> : null}
                </p>
                <p className="text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">{v.note ?? "No note"}</p>
                <p className="tabular text-[0.75rem] text-ink-3" title={v.created_at}>
                  {timeAgo(v.created_at)} · {v.created_by} · {v.chars.toLocaleString("en")} chars
                </p>
              </div>
              {!v.active ? (
                <Link
                  href={href({ a: a?.id, b: b?.id, restore: v.id })}
                  className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-card px-3 text-[0.8125rem] font-medium hover:bg-secondary sm:h-8 sm:w-auto"
                >
                  Restore as new rev
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" aria-label="Diff">
        <h2 className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">
          {a && b ? (
            <>
              <span className="font-mono normal-case">{a.rev}</span> (A) → <span className="font-mono normal-case">{b.rev}</span> (B)
            </>
          ) : (
            "Diff"
          )}
        </h2>
        {a && b ? (
          a.id === b.id ? (
            <p className="text-[0.9375rem] text-ink-3">A and B are the same rev. Pick two different ones.</p>
          ) : (
            <ConfigDiff before={pretty(a.payload_text)} after={pretty(b.payload_text)} />
          )
        ) : (
          <p className="text-[0.9375rem] text-ink-3">Only one rev saved so far, nothing to compare.</p>
        )}
      </section>
    </div>
  );
}
