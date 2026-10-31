import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getHealth, getInbox, getInboxCounts, type Funnel, type Kind } from "@/lib/radar";
import { InboxFilters, inboxHref, type InboxQuery } from "@/components/inbox-filters";
import { MatchCard } from "@/components/match-card";

// Per-request private data (searchParams): the layout's `instant = false` does not cover pages below it.
export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MODE = /^(remote|hybrid|onsite|unknown)$/;
const SOURCE = /^[a-z0-9-]{1,40}$/;

function parseQuery(sp: Record<string, string | string[] | undefined>): InboxQuery {
  const kind: Kind = one(sp.kind) === "gig" ? "gig" : "job";
  const mode = one(sp.mode);
  const source = one(sp.source);
  return {
    kind,
    mode: mode && MODE.test(mode) ? mode : undefined,
    source: source && SOURCE.test(source) ? source : undefined,
  };
}

const FUNNEL_STEPS: [key: string, label: string][] = [
  ["fetched", "fetched"],
  ["gate_a_pass", "passed gate A"],
  ["gate_b_pass", "passed gate B"],
  ["llm_calls", "scored by the LLM"],
  ["matches", "matched"],
];

function EmptyState({ q, funnel }: { q: InboxQuery; funnel: Funnel | null }) {
  const filtered = Boolean(q.mode || q.source);
  if (filtered) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[0.9375rem]">
        <p className="font-medium">No new {q.kind === "gig" ? "gigs" : "jobs"} for these filters.</p>
        <Link href={inboxHref({ kind: q.kind })} className="mt-2 inline-block font-medium underline underline-offset-4">
          Clear the filters
        </Link>
      </div>
    );
  }
  const steps = funnel ? FUNNEL_STEPS.filter(([k]) => typeof funnel[k] === "number") : [];
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 text-[0.9375rem]">
      <p className="font-medium">Nothing new to review.</p>
      <p className="text-muted-foreground">
        Each run fetches postings from every source, then drops most of them on purpose: gate A checks the title,
        location and freshness, gate B reads the description (experience, language, visa), and gate C is the LLM
        re-check and score. Only what clears all three and the minimum score lands here.
      </p>
      {steps.length > 0 ? (
        <p className="tabular text-[0.8125rem] text-ink-3">
          Last run: {steps.map(([k, label]) => `${funnel![k]} ${label}`).join(", ")}.
        </p>
      ) : null}
      <Link href="/filtered" className="inline-block font-medium underline underline-offset-4">
        See what the gates dropped
      </Link>
    </div>
  );
}

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const q = parseQuery(await searchParams);
  const [counts, matches, health] = await Promise.all([
    getInboxCounts(q.kind),
    getInbox({ kind: q.kind, mode: q.mode, source: q.source }),
    getHealth(),
  ]);

  return (
    <section className="space-y-4">
      <h1 className="sr-only">Today</h1>
      <InboxFilters q={q} counts={counts} />
      {matches.length === 0 ? (
        <EmptyState q={q} funnel={health?.last_funnel ?? null} />
      ) : (
        <ul className="space-y-2" aria-label={q.kind === "gig" ? "New gigs" : "New jobs"}>
          {matches.map((m) => (
            <MatchCard key={m.match_id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
