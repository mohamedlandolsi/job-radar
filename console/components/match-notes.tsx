"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewMatch } from "@/app/(console)/actions";
import { toastError } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const NOTES_MAX = 2000;

type FpReason = NonNullable<Parameters<typeof reviewMatch>[0]["fp_reason"]>;

// Free-text notes on a match (jr_review "save_notes"; an empty box clears them).
// fpReason: pass the current fp_reason of a "Not a fit" match. jr_review's save_notes otherwise writes
// fp_reason = null and trips jr_m_fp_needs_reason (fixed in sql/migrations/2026-10-31_jr_review_notes.sql;
// kept so the console also works against a database where that migration is not applied yet).
export function MatchNotes({ id, notes, fpReason }: { id: string; notes: string | null; fpReason?: FpReason | null }) {
  const router = useRouter();
  const saved = notes ?? "";
  const [value, setValue] = useState(saved);
  const [pending, startTransition] = useTransition();
  const changed = value !== saved;

  function save() {
    startTransition(async () => {
      const res = await reviewMatch({ id, action: "save_notes", notes: value, ...(fpReason ? { fp_reason: fpReason } : {}) });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      toast.success(value.trim() ? "Notes saved" : "Notes cleared");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="match-notes" className="sr-only">
        Notes
      </label>
      <Textarea
        id="match-notes"
        value={value}
        maxLength={NOTES_MAX}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Contacts, dates, what you sent..."
        disabled={pending}
        className="min-h-24"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={cn("tabular text-[0.8125rem]", value.length > NOTES_MAX - 100 ? "font-medium text-danger" : "text-ink-3")}>
          {value.length} of {NOTES_MAX}
        </span>
        <Button type="button" variant="outline" className="h-11 sm:h-8" disabled={!changed || pending} onClick={save}>
          {pending ? "Saving..." : "Save notes"}
        </Button>
      </div>
    </div>
  );
}
