"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { filteredHref, type DroppedQuery } from "@/lib/filtered-query";

type Option = { value: string; label: string };

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-input bg-card px-2 text-[0.9375rem] text-foreground sm:h-9 sm:text-[0.8125rem]";

function Select({ label, value, options, onChange }: { label: string; value?: string; options: Option[]; onChange: (v?: string) => void }) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-[0.75rem] font-medium text-muted-foreground">{label}</span>
      <select className={SELECT} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Filters for the dropped list. Only builds URLs: the server page reads them and queries v_jr_dropped.
// The controls show the new choice right away (local state); the page passes key={URL query} so they reset
// to the URL after navigation.
export function DroppedFilters({
  q,
  stages,
  reasons,
  sources,
}: {
  q: DroppedQuery;
  stages: Option[];
  reasons: Option[];
  sources: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cur, setCur] = useState<DroppedQuery>(q);
  const go = (next: DroppedQuery) => {
    setCur(next);
    startTransition(() => router.push(filteredHref(next), { scroll: false }));
  };
  const any = Boolean(cur.stage || cur.reason || cur.source || cur.flagged);

  return (
    <div className={cn("space-y-2", pending && "opacity-60")} aria-busy={pending}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select label="Stage" value={cur.stage} options={stages} onChange={(stage) => go({ ...cur, stage })} />
        <Select label="Reason" value={cur.reason} options={reasons} onChange={(reason) => go({ ...cur, reason })} />
        <Select label="Source" value={cur.source} options={sources} onChange={(source) => go({ ...cur, source })} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[0.9375rem] sm:min-h-8 sm:text-[0.8125rem]">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={Boolean(cur.flagged)}
            onChange={(e) => go({ ...cur, flagged: e.target.checked || undefined })}
          />
          Only flagged as should have passed
        </label>
        {any ? (
          <Link href="/filtered#dropped" scroll={false} className="text-[0.8125rem] font-medium underline underline-offset-4">
            Clear filters
          </Link>
        ) : null}
      </div>
    </div>
  );
}
