import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getPipeline, getPipelineCounts, PIPELINE_TABS, type PipelineTab } from "@/lib/radar";
import { SegmentedLinks } from "@/components/segmented-links";
import { MatchCard } from "@/components/match-card";

// Per-request private data (searchParams): the layout's `instant = false` does not cover pages below it.
export const instant = false;

const TAB_LABEL: Record<PipelineTab, string> = {
  shortlist: "Shortlist",
  pipeline: "Pipeline",
  closed: "Closed",
  not_a_fit: "Not a fit",
};

const EMPTY: Record<PipelineTab, { text: string; link?: { href: string; label: string } }> = {
  shortlist: { text: "Nothing shortlisted. Mark a match as Good fit on Today to keep it here.", link: { href: "/", label: "Go to Today" } },
  pipeline: { text: "No applications yet. Mark a match as Applied and it moves here, then on to interviewing and offer." },
  closed: { text: "Nothing closed. Applications marked as Rejected end up here." },
  not_a_fit: { text: "No matches marked as Not a fit. Their reasons feed the calibration on the Runs screen." },
};

function parseTab(v: string | string[] | undefined): PipelineTab {
  const t = Array.isArray(v) ? v[0] : v;
  return PIPELINE_TABS.includes(t as PipelineTab) ? (t as PipelineTab) : "shortlist";
}

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  await requireSession();
  const tab = parseTab((await searchParams).tab);
  const [counts, matches] = await Promise.all([getPipelineCounts(), getPipeline(tab)]);
  const empty = EMPTY[tab];

  return (
    <section className="space-y-4">
      <h1 className="sr-only">Pipeline</h1>
      <SegmentedLinks
        label="Pipeline stage"
        className="grid-cols-2"
        items={PIPELINE_TABS.map((t) => ({
          href: t === "shortlist" ? "/pipeline" : `/pipeline?tab=${t}`,
          label: TAB_LABEL[t],
          count: counts[t],
          active: t === tab,
        }))}
      />
      {matches.length === 0 ? (
        <div className="rounded-lg border bg-card p-4 text-[0.9375rem]">
          <p className="text-muted-foreground">{empty.text}</p>
          {empty.link ? (
            <Link href={empty.link.href} className="mt-2 inline-block font-medium underline underline-offset-4">
              {empty.link.label}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2" aria-label={TAB_LABEL[tab]}>
          {matches.map((m) => (
            <MatchCard key={m.match_id} m={m} context={{ from: "pipeline", tab }} />
          ))}
        </ul>
      )}
    </section>
  );
}
