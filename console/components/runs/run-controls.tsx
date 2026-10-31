"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Send } from "lucide-react";
import { toast } from "sonner";
import { requestRun, setPaused } from "@/app/(console)/actions";
import { toastError } from "@/lib/feedback";
import { timeAgo } from "@/lib/format";
import { requestPending } from "@/lib/run-format";
import { Button } from "@/components/ui/button";

const DAILY_MAX = 3; // jr_should_run: a requested run needs fewer than 3 completed runs today (Africa/Tunis)

// Pause / Resume (jr_set_paused) and "Request a run" (jr_request_run). The laptop's 30-minute schedule picks
// the request up; pause stops scheduled runs only, a requested run still runs.
export function RunControls({
  paused,
  requestedAt,
  runsToday,
  running,
}: {
  paused: boolean;
  requestedAt: string | null;
  runsToday: number;
  running: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waiting = requestPending(requestedAt);
  const full = runsToday >= DAILY_MAX;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          disabled={pending}
          onClick={() => run(() => setPaused(!paused), paused ? "Schedule resumed" : "Schedule paused")}
        >
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button type="button" className="h-11 sm:h-9" disabled={pending} onClick={() => run(() => requestRun(), "Run requested")}>
          <Send aria-hidden />
          {waiting ? "Request again" : "Request a run"}
        </Button>
      </div>
      <ul className="space-y-1 text-[0.8125rem]">
        <li className="text-muted-foreground">Requested runs start within 30 minutes when the laptop is on, max 3 a day.</li>
        {paused ? (
          <li className="font-medium text-foreground">Paused: scheduled runs are off. A requested run still runs.</li>
        ) : null}
        {waiting ? (
          <li className="font-medium text-foreground" title={requestedAt ?? undefined}>
            {running
              ? `Requested ${timeAgo(requestedAt!)}. A run is in progress; the request starts after it.`
              : `Requested ${timeAgo(requestedAt!)}, waiting for the laptop's next 30-minute check.`}
          </li>
        ) : requestedAt ? (
          <li className="text-ink-3">The last request ({timeAgo(requestedAt)}) expired: requests count for 24 hours.</li>
        ) : null}
        <li className={full ? "font-medium text-danger" : "text-ink-3"}>
          {runsToday} of {DAILY_MAX} runs completed today{full ? ": a request now waits until tomorrow (Africa/Tunis)." : "."}
        </li>
      </ul>
    </div>
  );
}
