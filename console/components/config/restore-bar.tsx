"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { nextRev } from "@/lib/next-rev";
import { ConfigSaveBar } from "@/components/form/config-save-bar";

// "Restore as new rev": the old payload, unchanged except its rev, saved through the same bar and checks.
export function RestoreBar({ text, oldRev, activeRev }: { text: string; oldRev: string; activeRev: string }) {
  const router = useRouter();
  const source = useMemo(() => ({ text }), [text]);
  return (
    <ConfigSaveBar
      source={source}
      baseRev={activeRev}
      summary={`Restore ${oldRev} as a new rev`}
      defaultNote={`Restore ${oldRev}`}
      noteRequired
      suggestedRev={nextRev(activeRev)}
      discardLabel="Cancel"
      onDiscard={() => router.push("/config?tab=versions")}
      onSaved={() => {
        router.push("/config?tab=versions");
        router.refresh();
      }}
    />
  );
}
