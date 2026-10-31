"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/form/tag-input";
import { NumberField, SelectField, TextField, regexError, type Board } from "@/components/form/fields";

const CADENCE = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

// One job board read through Jina: list pages, the regex that finds job links on them, cadence and caps.
export function BoardForm({ value, onChange, onRemove }: { value: Board; onChange: (v: Board) => void; onRemove: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Label"
          value={value.label}
          maxLength={80}
          onChange={(label) => onChange({ ...value, label })}
          error={value.label.trim() ? null : "Required"}
        />
        <div className="space-y-1">
          <span className="block text-[0.8125rem] font-medium text-muted-foreground">Key</span>
          <p className="flex h-11 items-center font-mono text-[0.8125rem] text-ink-3 sm:h-9">{value.key} (fixed: run stats are kept under it)</p>
        </div>
      </div>
      <TagInput
        label="List URLs"
        values={value.list_urls}
        max={6}
        mono
        allowCommas
        placeholder="https://..., then Enter"
        validate={(v) => (/^https:\/\/\S+$/.test(v) ? null : "Must start with https:// and contain no spaces")}
        onChange={(list_urls) => onChange({ ...value, list_urls })}
      />
      {value.list_urls.length === 0 ? <p className="text-[0.8125rem] font-medium text-danger">Add at least one list URL</p> : null}
      <TextField
        label="Job URL regex"
        value={value.job_url_regex}
        mono
        onChange={(job_url_regex) => onChange({ ...value, job_url_regex })}
        error={regexError(value.job_url_regex)}
        placeholder="https?://example.com/jobs/[a-z0-9-]+"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SelectField label="Cadence" value={value.cadence} options={CADENCE} onChange={(cadence) => onChange({ ...value, cadence })} />
        <NumberField label="Max items" value={value.max_items} min={1} max={60} onChange={(max_items) => onChange({ ...value, max_items })} />
        <label className="col-span-2 flex min-h-11 items-center gap-3 text-[0.9375rem] sm:col-span-1 sm:self-end sm:text-[0.8125rem]">
          <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
          {value.enabled ? "Enabled" : "Off"}
        </label>
      </div>
      <Button type="button" variant="ghost" className="h-11 text-danger sm:h-8" onClick={onRemove}>
        <Trash2 aria-hidden />
        Remove this board
      </Button>
    </div>
  );
}
