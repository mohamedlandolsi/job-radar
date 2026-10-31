import type { MatchEvent, MatchStatus } from "@/lib/radar";
import { STATUS_LABEL, VERDICT_LABEL, type Verdict } from "@/lib/match-display";
import { FP_REASONS } from "@/lib/reasons";
import { timeAgo } from "@/lib/format";

const statusLabel = (s: unknown) => (typeof s === "string" ? (STATUS_LABEL[s as MatchStatus] ?? s) : null);

function describe(e: MatchEvent): { title: string; detail: string | null } {
  const before = e.before ?? {};
  const after = e.after ?? {};
  if (e.action === "save_notes") {
    return { title: after.notes ? "Notes saved" : "Notes cleared", detail: null };
  }
  const title = VERDICT_LABEL[e.action as Verdict] ?? e.action.replace(/_/g, " ");
  const from = statusLabel(before.status);
  const to = statusLabel(after.status);
  const parts: string[] = [];
  if (from && to && from !== to) parts.push(`${from} → ${to}`);
  if (typeof after.fp_reason === "string") parts.push(FP_REASONS[after.fp_reason] ?? after.fp_reason);
  if ("notes" in after && after.notes) parts.push("notes saved");
  return { title, detail: parts.length ? parts.join(", ") : null };
}

// Audit trail from jr_events (entity 'match'), newest first.
export function EventHistory({ events }: { events: MatchEvent[] }) {
  if (events.length === 0) return <p className="text-[0.9375rem] text-ink-3">No verdicts yet.</p>;
  return (
    <ol className="space-y-3 border-l pl-4">
      {events.map((e) => {
        const d = describe(e);
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-2 -left-[1.3rem] size-2 rounded-full bg-meter-tick" aria-hidden />
            <p className="text-[0.9375rem] font-medium">{d.title}</p>
            {d.detail ? <p className="text-[0.8125rem] text-muted-foreground">{d.detail}</p> : null}
            <p className="text-[0.8125rem] text-ink-3" title={e.created_at}>
              {timeAgo(e.created_at)} · {e.actor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
