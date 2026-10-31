"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { flagPosting } from "@/app/(console)/actions";
import { toastError } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const NOTE_MAX = 500;

// "Should have passed" (jr_flag_posting false_negative, optional note) or "Unflag" for one dropped posting.
export function FlagControls({ id, flagged, title }: { id: string; flagged: boolean; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function send(flag: "false_negative" | null) {
    startTransition(async () => {
      const n = note.trim();
      const res = await flagPosting(flag && n ? { id, flag, note: n } : { id, flag });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      toast.success(flag ? "Flagged as should have passed" : "Flag removed");
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  if (flagged) {
    return (
      <Button type="button" variant="outline" className="h-11 sm:h-8" disabled={pending} onClick={() => send(null)}>
        {pending ? "Saving..." : "Unflag"}
      </Button>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-11 sm:h-8" disabled={pending} onClick={() => setOpen(true)}>
        Should have passed
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Should have passed</DialogTitle>
            <DialogDescription className="[overflow-wrap:anywhere]">
              {title}. The flag feeds the Filtered counts, so you can tell which rule is too strict.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label htmlFor={`flag-note-${id}`} className="text-[0.8125rem] font-medium text-muted-foreground">
              Note (optional)
            </label>
            <Textarea
              id={`flag-note-${id}`}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why it fits, e.g. the 2 years are a preference"
              disabled={pending}
              className="min-h-20"
            />
            <p className={cn("tabular text-right text-[0.75rem]", note.length > NOTE_MAX - 50 ? "font-medium text-danger" : "text-ink-3")}>
              {note.length} of {NOTE_MAX}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" className="h-11 w-full sm:h-9 sm:w-auto" disabled={pending} onClick={() => send("false_negative")}>
              {pending ? "Saving..." : "Flag it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
