"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { RadarConfig } from "@/lib/config-schema";
import type { SourceHealth } from "@/lib/radar";
import { buildSourceRows, type Dot, type SourceRow } from "@/lib/source-rows";
import { nextRev } from "@/lib/next-rev";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldError, INPUT, type Board } from "@/components/form/fields";
import { LinkedInForm } from "@/components/sources/linkedin-form";
import { RedditForm } from "@/components/sources/reddit-form";
import { AtsForm } from "@/components/sources/ats-form";
import { BoardForm } from "@/components/sources/board-form";
import { ConfigSaveBar } from "@/components/form/config-save-bar";

const DOT: Record<Dot, { cls: string; label: string }> = {
  green: { cls: "bg-state-approved", label: "Healthy: fetched postings, no errors" },
  amber: { cls: "bg-state-pending", label: "Fetched postings, but with errors" },
  red: { cls: "bg-danger", label: "Fetched nothing in the last 7 days" },
  off: { cls: "bg-meter-tick", label: "Switched off" },
};

const MAX_BOARD_PAGES = 30;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Phones: "1 match", "3 errors". From lg up the column header names the number, so the label is hidden.
function Stat({ label, plural, value, strong = false }: { label: string; plural?: string; value: number; strong?: boolean }) {
  return (
    <span className="tabular whitespace-nowrap">
      <span className={cn(strong ? "font-semibold text-foreground" : "text-foreground")}>{value}</span>
      <span className="text-ink-3 lg:sr-only"> {value === 1 || !plural ? label : plural}</span>
    </span>
  );
}

// Sources: health per source (7 days) and the source part of the config, edited as a draft.
// Nothing is saved until "Save as new rev" in the save bar.
export function SourcesEditor({ active, health }: { active: { rev: string; payload: RadarConfig }; health: SourceHealth[] }) {
  const base = active.payload;
  const [draft, setDraft] = useState<RadarConfig>(() => clone(base));
  const [open, setOpen] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [discardCount, setDiscardCount] = useState(0);

  const { rows, unknown } = useMemo(() => buildSourceRows(draft, health), [draft, health]);
  const S = draft.sources;
  const setSources = (patch: Partial<RadarConfig["sources"]>) => setDraft((d) => ({ ...d, sources: { ...d.sources, ...patch } }));

  // What changed, as source keys (for the counter and the default note).
  const changed = useMemo(() => {
    const out: string[] = [];
    for (const k of Object.keys(S) as (keyof typeof S)[]) {
      if (k === "boards") continue;
      if (!same(S[k], base.sources[k])) out.push(k);
    }
    const baseBoards = new Map(base.sources.boards.map((b) => [b.key, b]));
    const draftKeys = new Set(S.boards.map((b) => b.key));
    for (const b of S.boards) if (!same(b, baseBoards.get(b.key))) out.push(baseBoards.has(b.key) ? b.key : `${b.key} (new)`);
    for (const k of baseBoards.keys()) if (!draftKeys.has(k)) out.push(`${k} (removed)`);
    if (out.length === 0 && !same(S.boards.map((b) => b.key), base.sources.boards.map((b) => b.key))) out.push("board order");
    return out;
  }, [S, base]);

  const suggestedRev = useMemo(() => nextRev(active.rev), [active.rev]);
  const source = useMemo(() => ({ draft }), [draft]);
  const boardPages = S.boards.filter((b) => b.enabled).reduce((n, b) => n + b.list_urls.length, 0);

  function toggle(row: SourceRow, enabled: boolean) {
    if (row.kind === "board") {
      setSources({ boards: S.boards.map((b) => (b.key === row.key ? { ...b, enabled } : b)) });
    } else {
      const k = row.key as keyof typeof S;
      setSources({ [k]: { ...(S[k] as object), enabled } } as Partial<typeof S>);
    }
  }

  const keyError = !newKey
    ? null
    : !/^[a-z0-9-]{2,40}$/.test(newKey)
      ? "2 to 40 lowercase letters, digits or dashes"
      : S.boards.some((b) => b.key === newKey) || newKey in S
        ? `"${newKey}" is already used`
        : null;

  function addBoard() {
    if (!newKey || keyError) return;
    const b: Board = { key: newKey, label: newKey, enabled: false, cadence: "daily", max_items: 30, detail: "jina", list_urls: [], job_url_regex: "" };
    setSources({ boards: [...S.boards, b] });
    setOpen(`board:${newKey}`);
    setNewKey("");
  }

  function form(row: SourceRow) {
    switch (row.kind) {
      case "linkedin":
        return <LinkedInForm value={S.linkedin} onChange={(linkedin) => setSources({ linkedin })} />;
      case "reddit":
        return <RedditForm value={S.reddit} onChange={(reddit) => setSources({ reddit })} />;
      case "ats":
        return <AtsForm value={S.ats} onChange={(ats) => setSources({ ats })} />;
      case "board": {
        const b = S.boards.find((x) => x.key === row.key);
        return b ? (
          <BoardForm
            value={b}
            onChange={(nb) => setSources({ boards: S.boards.map((x) => (x.key === row.key ? nb : x)) })}
            onRemove={() => {
              setSources({ boards: S.boards.filter((x) => x.key !== row.key) });
              setOpen(null);
            }}
          />
        ) : null;
      }
      default:
        return null;
    }
  }

  const editedKeys = new Set(changed.map((c) => c.replace(/ \((new|removed)\)$/, "")));

  return (
    <div key={discardCount} className={cn("space-y-4", changed.length > 0 && "pb-56 sm:pb-40")}>
      <p className="text-[0.8125rem] text-ink-3">
        Rev {active.rev}. Stats cover completed runs of the last 7 days. Changes stay a draft until you save them as a new rev.
      </p>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_repeat(5,4.25rem)_6.5rem_3rem] gap-2 border-b px-3 py-2 text-[0.75rem] font-semibold tracking-wide text-muted-foreground uppercase lg:grid">
          <span>Source</span>
          <span>Cadence</span>
          <span className="text-right">Fetched</span>
          <span className="text-right">Gate A</span>
          <span className="text-right">New</span>
          <span className="text-right">Matches</span>
          <span className="text-right">Errors</span>
          <span>Last ok</span>
          <span className="sr-only">Enabled</span>
        </div>
        <ul className="divide-y">
          {rows.map((r) => {
            const h = r.health;
            const editable = r.kind !== "v1";
            const id = r.kind === "board" ? `board:${r.key}` : r.key;
            const isOpen = open === id;
            return (
              <li key={id} data-source={r.key} className={cn(!r.enabled && "bg-secondary/40")}>
                <div className="space-y-1.5 px-3 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_5rem_repeat(5,4.25rem)_6.5rem_3rem] lg:items-center lg:gap-2 lg:space-y-0">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[r.dot].cls)} title={DOT[r.dot].label}>
                      <span className="sr-only">{DOT[r.dot].label}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 font-medium [overflow-wrap:anywhere]">
                        {r.label}
                        {editedKeys.has(r.key) ? <span className="text-[0.75rem] font-semibold text-state-pending">edited</span> : null}
                      </p>
                      <p className="font-mono text-[0.75rem] text-ink-3">{r.key}</p>
                    </div>
                    <Switch
                      className="mt-1 lg:hidden"
                      checked={r.enabled}
                      onCheckedChange={(v) => toggle(r, v)}
                      aria-label={`${r.label} enabled`}
                    />
                  </div>
                  {/* Phones: one wrapped line of stats. lg: grid cells. */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5 text-[0.8125rem] lg:contents lg:pl-0">
                    <span className="text-muted-foreground">{r.cadence.charAt(0).toUpperCase() + r.cadence.slice(1)}</span>
                    <span className="lg:text-right">
                      <Stat label="fetched" value={h?.fetched ?? 0} strong />
                    </span>
                    <span className="lg:text-right">
                      <Stat label="gate A" value={h?.gate_a_pass ?? 0} />
                    </span>
                    <span className="lg:text-right">
                      <Stat label="new" value={h?.new_postings ?? 0} />
                    </span>
                    <span className="lg:text-right">
                      <Stat label="match" plural="matches" value={h?.matches ?? 0} />
                    </span>
                    <span className={cn("lg:text-right", (h?.errors ?? 0) > 0 && "text-danger")}>
                      <Stat label="error" plural="errors" value={h?.errors ?? 0} />
                    </span>
                    <span className="text-ink-3" title={h?.last_ok_at ?? undefined}>
                      {h?.last_ok_at ? `ok ${timeAgo(h.last_ok_at)}` : "never ok"}
                    </span>
                  </div>
                  <span className="hidden justify-end lg:flex">
                    <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} aria-label={`${r.label} enabled`} />
                  </span>
                </div>
                {h?.last_error ? (
                  <p className="px-3 pb-2 pl-8 font-mono text-[0.75rem] text-danger [overflow-wrap:anywhere]" title="Last error, verbatim">
                    {h.last_error}
                  </p>
                ) : null}
                {editable ? (
                  <div className="px-3 pb-3 pl-8">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 sm:h-8"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : id)}
                    >
                      {isOpen ? "Close" : r.kind === "board" ? "Edit board" : r.kind === "linkedin" ? "Edit searches" : r.kind === "reddit" ? "Edit subreddits and queries" : "Edit companies"}
                      <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} aria-hidden />
                    </Button>
                    {isOpen ? <div className="mt-3 rounded-md border bg-secondary/30 p-3">{form(r)}</div> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-3">
        <p className="text-[0.8125rem] font-semibold">Add a board</p>
        <p className={cn("tabular text-[0.8125rem]", boardPages > MAX_BOARD_PAGES ? "font-semibold text-danger" : "text-ink-3")}>
          Enabled boards fetch {boardPages} of {MAX_BOARD_PAGES} list pages a run.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && addBoard()}
            placeholder="new-board-key"
            aria-label="New board key"
            aria-invalid={keyError ? true : undefined}
            className={cn(INPUT, "w-full font-mono sm:w-64")}
          />
          <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={!newKey || Boolean(keyError) || S.boards.length >= 30} onClick={addBoard}>
            <Plus aria-hidden />
            Add board
          </Button>
        </div>
        <FieldError>{keyError}</FieldError>
      </div>

      {unknown.length > 0 ? (
        <div className="rounded-lg border bg-card p-3 text-[0.8125rem]">
          <p className="font-semibold">In the run stats but not in this config</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {unknown.map((u) => (
              <li key={u.source}>
                <span className="font-mono">{u.source}</span>: {u.fetched} fetched, {u.errors} errors
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {changed.length > 0 ? (
        <ConfigSaveBar
          key={suggestedRev}
          source={source}
          baseRev={active.rev}
          summary={`${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`}
          defaultNote={`Sources: ${changed.join(", ")}`}
          suggestedRev={suggestedRev}
          onDiscard={() => {
            setDraft(clone(base));
            setOpen(null);
            setDiscardCount((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
