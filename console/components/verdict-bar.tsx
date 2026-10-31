"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewMatch } from "@/app/(console)/actions";
import type { MatchStatus } from "@/lib/radar";
import { ALLOWED_VERDICTS, VERDICT_DONE, VERDICT_LABEL, type Verdict } from "@/lib/match-display";
import { FP_REASONS } from "@/lib/reasons";
import { toastError } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const NOTES_MAX = 2000;

// The 11 codes reviewMatch() accepts (same keys as FP_REASONS).
type FpReason = NonNullable<Parameters<typeof reviewMatch>[0]["fp_reason"]>;
const REASON_OPTIONS = Object.entries(FP_REASONS) as [FpReason, string][];

function variantFor(v: Verdict, first: boolean): "default" | "outline" | "ghost" {
  if (v === "reopen") return "ghost";
  if (v === "false_positive" || v === "rejected") return "outline";
  return first ? "default" : "outline";
}

// Verdict buttons allowed by jr_review for the current status. The database re-checks every transition,
// so a stale page gets "invalid_transition: ..." back verbatim in a toast.
export function VerdictBar({ id, status }: { id: string; status: MatchStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<FpReason | null>(null);
  const [notes, setNotes] = useState("");
  const verdicts = ALLOWED_VERDICTS[status];
  if (verdicts.length === 0) return null;

  function run(action: Verdict, extra: { fp_reason?: FpReason; notes?: string } = {}) {
    startTransition(async () => {
      const res = await reviewMatch({ id, action, ...extra });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      toast.success(VERDICT_DONE[action]);
      setSheetOpen(false);
      setReason(null);
      setNotes("");
      router.refresh();
    });
  }

  function submitNotAFit() {
    if (!reason) return;
    const n = notes.trim();
    // Only send notes when typed: jr_review treats an empty "notes" as "clear the notes".
    run("false_positive", n ? { fp_reason: reason, notes: n } : { fp_reason: reason });
  }

  const firstPositive = verdicts.find((v) => v !== "false_positive" && v !== "reopen" && v !== "rejected");

  return (
    <>
      {/* Phones: fixed above the tab bar (h-14). From sm up: an inline toolbar. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-card px-3 py-2 shadow-lg sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div role="toolbar" aria-label="Verdict" className="flex gap-2">
          {verdicts.map((v) => (
            <Button
              key={v}
              type="button"
              variant={variantFor(v, v === firstPositive)}
              disabled={pending}
              className={cn("h-11 flex-1 sm:h-9 sm:flex-none sm:px-4", v === "reopen" && "flex-none px-3")}
              onClick={() => (v === "false_positive" ? setSheetOpen(true) : run(v))}
            >
              {VERDICT_LABEL[v]}
            </Button>
          ))}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => !pending && setSheetOpen(open)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90dvh] max-w-lg gap-3 overflow-hidden rounded-t-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="p-0 pr-8">
            <SheetTitle>Not a fit</SheetTitle>
            <SheetDescription>Why is this match wrong? The reason feeds the calibration on the Runs screen.</SheetDescription>
          </SheetHeader>
          {/* Header and footer stay put; only the reasons and notes scroll on short screens. */}
          <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
            <fieldset className="space-y-1" disabled={pending}>
              <legend className="sr-only">Reason</legend>
              {REASON_OPTIONS.map(([code, label]) => (
                <label
                  key={code}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-[0.9375rem]",
                    reason === code ? "border-foreground bg-secondary font-medium" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="fp_reason"
                    value={code}
                    checked={reason === code}
                    onChange={() => setReason(code)}
                    className="size-4 accent-foreground"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1">
              <label htmlFor="fp-notes" className="text-[0.8125rem] font-medium text-muted-foreground">
                Notes (optional)
              </label>
              <Textarea
                id="fp-notes"
                value={notes}
                maxLength={NOTES_MAX}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What gave it away?"
                disabled={pending}
                className="min-h-20"
              />
            </div>
          </div>
          <SheetFooter className="p-0">
            <Button type="button" className="h-11 w-full" disabled={!reason || pending} onClick={submitNotAFit}>
              {pending ? "Saving..." : "Mark as not a fit"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
