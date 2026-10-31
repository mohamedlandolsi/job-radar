import Link from "next/link";
import { Info } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getActiveConfig, getConfigVersion, getConfigVersions } from "@/lib/radar";
import type { RadarConfig } from "@/lib/config-schema";
import { ConfigEditor } from "@/components/config/config-editor";
import { Versions } from "@/components/config/versions";

// Per-request private data (searchParams): the layout's `instant = false` does not cover pages below it.
export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const id = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

export default async function ConfigPage({ searchParams }: PageProps<"/config">) {
  await requireSession();
  const sp = await searchParams;
  const tab = one(sp.tab) === "versions" ? "versions" : one(sp.tab) === "json" ? "json" : "form";
  const active = await getActiveConfig();

  if (!active) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Config</h1>
        <p className="rounded-lg border bg-card p-4 text-[0.9375rem] text-ink-3">No config saved yet. Apply sql/radar_v2_schema.sql: it seeds rev v2-001.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Config</h1>
        <p className="text-[0.8125rem] text-ink-3">
          Active rev <span className="font-mono text-foreground">{active.rev}</span>
        </p>
      </div>
      <p className="flex gap-2 rounded-lg border bg-card p-3 text-[0.8125rem] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Changes apply at the next run. Saving a new rev also re-evaluates postings that are still listed and that an earlier
          rev&apos;s gates dropped, so relaxing a rule can bring them back.
        </span>
      </p>
      {tab === "versions" ? <VersionsTab sp={sp} activeId={active.id} activeRev={active.rev} activeText={active.payload_text} /> : (
        // payload_text keeps the author's key order (jsonb re-sorts keys); key: a saved rev remounts the editor.
        <ConfigEditor key={active.id} active={{ rev: active.rev, payload: JSON.parse(active.payload_text) as RadarConfig }} initialMode={tab} />
      )}
    </section>
  );
}

async function VersionsTab({
  sp,
  activeId,
  activeRev,
  activeText,
}: {
  sp: Record<string, string | string[] | undefined>;
  activeId: number;
  activeRev: string;
  activeText: string;
}) {
  const versions = await getConfigVersions(20);
  // Defaults: the previous rev (A) against the active one (B).
  const aId = id(sp.a) ?? versions[1]?.id;
  const bId = id(sp.b) ?? activeId;
  const restoreId = id(sp.restore);
  const [a, b, restore] = await Promise.all([
    aId ? getConfigVersion(aId) : null,
    getConfigVersion(bId),
    restoreId && restoreId !== activeId ? getConfigVersion(restoreId) : null,
  ]);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Config views" className="grid grid-cols-3 gap-1 rounded-md bg-secondary p-1 sm:flex sm:w-fit">
        <Link href="/config" role="tab" aria-selected={false} className="flex h-11 items-center justify-center rounded px-3 text-[0.8125rem] font-medium text-muted-foreground sm:h-8">
          Form
        </Link>
        <Link href="/config?tab=json" role="tab" aria-label="Advanced JSON" aria-selected={false} className="flex h-11 items-center justify-center rounded px-3 text-[0.8125rem] font-medium text-muted-foreground sm:h-8">
          <span className="sm:hidden">JSON</span>
          <span className="hidden sm:inline">Advanced JSON</span>
        </Link>
        <span role="tab" aria-selected className="flex h-11 items-center justify-center rounded border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground sm:h-8">
          Versions
        </span>
      </div>
      <Versions versions={versions} a={a} b={b} restore={restore} activeText={activeText} activeRev={activeRev} />
    </div>
  );
}
