"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveConfig } from "@/app/(console)/actions";
import { parseConfigText, type RadarConfig } from "@/lib/config-schema";
import { toastError } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { INPUT } from "@/components/form/fields";
import { cn } from "@/lib/utils";

// What to save: a draft object (forms), or raw JSON text (Advanced JSON, Restore).
export type SaveSource = { draft: RadarConfig } | { text: string };

// Builds the exact text sent to saveConfig(): the document with "rev" set to the New rev field.
// Raw text keeps its key order; it is re-indented with 2 spaces like every console save.
function buildText(src: SaveSource, rev: string): { text: string } | { error: string } {
  if ("draft" in src) return { text: JSON.stringify({ ...src.draft, rev }, null, 2) };
  try {
    const data = JSON.parse(src.text) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "config: must be a JSON object" };
    return { text: JSON.stringify({ ...(data as object), rev }, null, 2) };
  } catch (e) {
    return { error: `invalid_json: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Unsaved-changes bar shared by Sources, Config and Restore: rev (suggested, editable), note, live validation
// with the zod mirror, then saveConfig(). The database validates again; its message is shown verbatim.
export function ConfigSaveBar({
  source,
  baseRev,
  summary,
  suggestedRev,
  onDiscard,
  discardLabel = "Discard",
  defaultNote,
  noteRequired = false,
  revHint,
  onSaved,
}: {
  source: SaveSource;
  baseRev: string;
  summary: string;
  suggestedRev: string;
  onDiscard: () => void;
  discardLabel?: string;
  defaultNote: string; // used until the note field is edited
  noteRequired?: boolean;
  revHint?: string;
  onSaved?: () => void; // default: refresh the page (the editor remounts on the new active rev)
}) {
  const router = useRouter();
  const [rev, setRev] = useState(suggestedRev);
  const [note, setNote] = useState<string | null>(null); // null: follow defaultNote
  const [serverError, setServerError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false); // phones: rev and note fold away when nothing needs fixing
  const [pending, startTransition] = useTransition();

  // Reloading or closing the tab with unsaved changes asks first (the bar only exists while there are changes).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const noteValue = (note ?? defaultNote).slice(0, 300);
  const built = useMemo(() => buildText(source, rev.trim()), [source, rev]);
  const check = useMemo(() => ("text" in built ? parseConfigText(built.text) : null), [built]);
  const revError = !rev.trim() ? "Enter a new rev" : rev.trim() === baseRev ? `Use a new rev, ${baseRev} is the current one` : null;
  const noteError = noteRequired && !noteValue.trim() ? "Enter a note: what changed and why" : null;
  const problems = [
    ...(revError ? [revError] : []),
    ...(noteError ? [noteError] : []),
    ...("error" in built ? [built.error] : check && !check.ok ? check.errors : []),
  ];
  const metaOpen = showMeta || Boolean(revError || noteError);

  function save() {
    if (problems.length || !("text" in built)) return;
    const text = built.text;
    setServerError(null);
    startTransition(async () => {
      const res = await saveConfig({ text, note: noteValue.trim() || undefined });
      if (!res.ok) {
        setServerError(res.error);
        toastError(res.error);
        return;
      }
      toast.success(`Saved as rev ${rev.trim()}`, { description: "The next run uses it." });
      if (onSaved) onSaved();
      else router.refresh();
    });
  }

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 max-h-[60dvh] overflow-y-auto border-t bg-card px-4 py-3 shadow-lg sm:bottom-0 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-[1200px] space-y-2">
        <p className="text-[0.8125rem]">
          <span className="font-semibold">{summary}</span>
          <span className="text-ink-3"> · based on rev {baseRev}</span>
          <span className="sm:hidden">
            <span className="text-ink-3"> · saves as </span>
            <span className="font-mono text-[0.75rem]">{rev.trim() || "?"}</span>{" "}
            <button type="button" className="font-medium underline underline-offset-4" aria-expanded={metaOpen} onClick={() => setShowMeta((v) => !v)}>
              {metaOpen ? "hide" : "change"}
            </button>
          </span>
        </p>
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto_auto] sm:items-end">
          <div className={cn("gap-2 sm:contents", metaOpen ? "grid" : "hidden")}>
            <label className="min-w-0 space-y-1">
              <span className="block text-[0.75rem] font-medium text-muted-foreground">New rev</span>
              <input
                value={rev}
                maxLength={80}
                onChange={(e) => setRev(e.target.value)}
                className={cn(INPUT, "font-mono")}
                aria-invalid={revError ? true : undefined}
              />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-[0.75rem] font-medium text-muted-foreground">Note{noteRequired ? "" : " (optional)"}</span>
              <input
                value={noteValue}
                maxLength={300}
                placeholder={noteRequired ? "What changed and why" : undefined}
                onChange={(e) => setNote(e.target.value)}
                className={INPUT}
                aria-invalid={noteError ? true : undefined}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={pending} onClick={onDiscard}>
              {discardLabel}
            </Button>
            <Button type="button" className="h-11 sm:h-9" disabled={pending || problems.length > 0} onClick={save}>
              {pending ? "Saving..." : "Save as new rev"}
            </Button>
          </div>
        </div>
        {revHint ? <p className="text-[0.75rem] text-ink-3">{revHint}</p> : null}
        {problems.length > 0 ? (
          <ul className="space-y-0.5 font-mono text-[0.75rem] text-danger" aria-label="Problems to fix before saving">
            {problems.map((p) => (
              <li key={p} className="[overflow-wrap:anywhere]">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
        {serverError ? (
          <p className="font-mono text-[0.75rem] whitespace-pre-wrap text-danger [overflow-wrap:anywhere]" role="alert">
            {serverError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
