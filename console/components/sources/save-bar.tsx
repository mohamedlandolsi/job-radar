"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveConfig } from "@/app/(console)/actions";
import { parseConfigText, type RadarConfig } from "@/lib/config-schema";
import { toastError } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import { INPUT } from "@/components/sources/fields";
import { cn } from "@/lib/utils";

// Unsaved-changes bar: rev (editable), note, live validation with the zod mirror, then saveConfig().
// The database validates again (budgets, invariants); its message is shown verbatim.
export function SaveBar({
  draft,
  baseRev,
  changed,
  suggestedRev,
  onDiscard,
}: {
  draft: RadarConfig;
  baseRev: string;
  changed: string[];
  suggestedRev: string;
  onDiscard: () => void;
}) {
  const router = useRouter();
  const [rev, setRev] = useState(suggestedRev);
  const [note, setNote] = useState(`Sources: ${changed.join(", ")}`);
  const [noteTouched, setNoteTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false); // phones: rev and note fold away (rev is pre-filled)
  const [pending, startTransition] = useTransition();

  const autoNote = `Sources: ${changed.join(", ")}`.slice(0, 300);
  const noteValue = noteTouched ? note : autoNote;
  const text = useMemo(() => JSON.stringify({ ...draft, rev: rev.trim() }, null, 2), [draft, rev]);
  const check = useMemo(() => parseConfigText(text), [text]);
  const revError = !rev.trim() ? "Enter a rev" : rev.trim() === baseRev ? `Use a new rev, ${baseRev} is the current one` : null;
  const problems = [...(revError ? [revError] : []), ...(check.ok ? [] : check.errors)];

  function save() {
    if (problems.length) return;
    setServerError(null);
    startTransition(async () => {
      const res = await saveConfig({ text, note: noteValue.trim() || undefined });
      if (!res.ok) {
        setServerError(res.error);
        toastError(res.error);
        return;
      }
      toast.success(`Saved as rev ${rev.trim()}`, { description: "The next run uses it." });
      router.refresh();
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
          <span className="font-semibold">
            {changed.length} unsaved {changed.length === 1 ? "change" : "changes"}
          </span>
          <span className="text-ink-3"> · based on rev {baseRev}</span>
          <span className="sm:hidden">
            <span className="text-ink-3"> · saves as </span>
            <span className="font-mono text-[0.75rem]">{rev.trim() || "?"}</span>{" "}
            <button type="button" className="font-medium underline underline-offset-4" aria-expanded={showMeta} onClick={() => setShowMeta((v) => !v)}>
              {showMeta ? "hide" : "change"}
            </button>
          </span>
        </p>
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto_auto] sm:items-end">
          <div className={cn("gap-2 sm:contents", showMeta || revError ? "grid" : "hidden")}>
            <label className="min-w-0 space-y-1">
              <span className="block text-[0.75rem] font-medium text-muted-foreground">New rev</span>
              <input value={rev} maxLength={80} onChange={(e) => setRev(e.target.value)} className={cn(INPUT, "font-mono")} aria-invalid={revError ? true : undefined} />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-[0.75rem] font-medium text-muted-foreground">Note</span>
              <input
                value={noteValue}
                maxLength={300}
                onChange={(e) => {
                  setNoteTouched(true);
                  setNote(e.target.value);
                }}
                className={INPUT}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={pending} onClick={onDiscard}>
              Discard
            </Button>
            <Button type="button" className="h-11 sm:h-9" disabled={pending || problems.length > 0} onClick={save}>
              {pending ? "Saving..." : "Save as new rev"}
            </Button>
          </div>
        </div>
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
