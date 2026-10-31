"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckGroup, SelectField, TextField, type LinkedIn, type LinkedInSearch } from "@/components/form/fields";

const WORK_TYPES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

const EXPERIENCE = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry" },
  { value: "associate", label: "Associate" },
  { value: "mid_senior", label: "Mid-senior" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
] as const;

const PAGES = [
  { value: "1", label: "1 page" },
  { value: "2", label: "2 pages" },
  { value: "3", label: "3 pages" },
] as const;

const MAX_SEARCHES = 10;
const MAX_REQUESTS = 20;

// LinkedIn guest searches: keywords, location, work types, experience. Budget: searches x max_pages <= 20.
export function LinkedInForm({ value, onChange }: { value: LinkedIn; onChange: (v: LinkedIn) => void }) {
  const requests = value.searches.length * value.max_pages;
  const set = (i: number, patch: Partial<LinkedInSearch>) =>
    onChange({ ...value, searches: value.searches.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <SelectField
            label="Pages per search"
            value={String(value.max_pages) as "1" | "2" | "3"}
            options={PAGES}
            onChange={(v) => onChange({ ...value, max_pages: Number(v) })}
          />
        </div>
        <p className={cn("tabular pb-2 text-[0.8125rem]", requests > MAX_REQUESTS ? "font-semibold text-danger" : "text-ink-3")}>
          {value.searches.length} {value.searches.length === 1 ? "search" : "searches"} × {value.max_pages} = {requests} of {MAX_REQUESTS} requests a run
        </p>
      </div>

      <ol className="space-y-3">
        {value.searches.map((s, i) => (
          <li key={i} className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.8125rem] font-semibold">Search {i + 1}</p>
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-danger sm:h-8"
                onClick={() => onChange({ ...value, searches: value.searches.filter((_, j) => j !== i) })}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Keywords"
                value={s.keywords}
                maxLength={120}
                onChange={(keywords) => set(i, { keywords })}
                error={s.keywords.trim() ? null : "Required"}
              />
              <TextField
                label="Location"
                value={s.location}
                maxLength={80}
                onChange={(location) => set(i, { location })}
                error={s.location.trim() ? null : "Required"}
              />
            </div>
            <CheckGroup
              label="Work types"
              options={WORK_TYPES}
              values={s.work_types}
              onChange={(work_types) => set(i, { work_types })}
              error={s.work_types.length ? null : "Pick at least one"}
            />
            <CheckGroup
              label="Experience"
              options={EXPERIENCE}
              values={s.experience ?? []}
              onChange={(experience) => set(i, { experience: experience.length ? experience : undefined })}
            />
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="h-11 sm:h-8"
        disabled={value.searches.length >= MAX_SEARCHES}
        onClick={() =>
          onChange({
            ...value,
            searches: [...value.searches, { keywords: "", location: "Worldwide", work_types: ["remote"], experience: ["internship", "entry"] }],
          })
        }
      >
        <Plus aria-hidden />
        Add search {value.searches.length >= MAX_SEARCHES ? `(${MAX_SEARCHES} at most)` : ""}
      </Button>
    </div>
  );
}
