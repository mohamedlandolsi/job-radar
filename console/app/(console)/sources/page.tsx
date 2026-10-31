import { requireSession } from "@/lib/session";
import { getActiveConfig, getSourceHealth } from "@/lib/radar";
import { SourcesEditor } from "@/components/sources/sources-editor";
import type { RadarConfig } from "@/lib/config-schema";

// Per-request private data: the layout's `instant = false` does not cover pages below it.
export const instant = false;

export default async function SourcesPage() {
  await requireSession();
  const [active, health] = await Promise.all([getActiveConfig(), getSourceHealth()]);
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Sources</h1>
      {active ? (
        // key: a saved rev remounts the editor, so the draft starts again from the new active config.
        // payload_text, not payload: jsonb re-sorts keys, the saved text keeps the author's order, so a
        // console save changes only what was edited and version diffs stay readable.
        <SourcesEditor key={active.id} active={{ rev: active.rev, payload: JSON.parse(active.payload_text) as RadarConfig }} health={health} />
      ) : (
        <p className="rounded-lg border bg-card p-4 text-[0.9375rem] text-ink-3">
          No config saved yet. Apply sql/radar_v2_schema.sql: it seeds rev v2-001.
        </p>
      )}
    </section>
  );
}
