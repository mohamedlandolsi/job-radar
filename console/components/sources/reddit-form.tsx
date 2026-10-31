"use client";

import { TagInput } from "@/components/sources/tag-input";
import type { Reddit } from "@/components/sources/fields";

// Reddit through Tavily: the subreddit allow-list and the search queries (one Tavily credit each per run).
export function RedditForm({ value, onChange }: { value: Reddit; onChange: (v: Reddit) => void }) {
  return (
    <div className="space-y-4">
      <TagInput
        label="Subreddits"
        values={value.subreddits}
        max={60}
        placeholder="e.g. forhire or r/forhire, then Enter"
        normalize={(v) => v.replace(/^\/?r\//i, "")}
        validate={(v) => (/^[A-Za-z0-9_]{2,21}$/.test(v) ? null : "A subreddit name: 2 to 21 letters, digits or _")}
        onChange={(subreddits) => onChange({ ...value, subreddits })}
      />
      <TagInput
        label="Queries"
        values={value.queries}
        max={20}
        allowCommas
        placeholder="A Tavily search, then Enter"
        onChange={(queries) => onChange({ ...value, queries })}
      />
      <p className="text-[0.8125rem] text-ink-3">
        The run sends at most {value.max_queries} of these queries (sources.reddit.max_queries), one Tavily credit each.
      </p>
    </div>
  );
}
