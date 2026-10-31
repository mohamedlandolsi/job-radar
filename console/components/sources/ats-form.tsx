"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField, type Ats, type AtsCompany } from "@/components/form/fields";

const ATS = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
] as const;

const MAX = 60;

// ATS watchlist: public Greenhouse, Lever and Ashby job-board APIs, one board token per company.
export function AtsForm({ value, onChange }: { value: Ats; onChange: (v: Ats) => void }) {
  const set = (i: number, patch: Partial<AtsCompany>) =>
    onChange({ ...value, companies: value.companies.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {value.companies.map((c, i) => (
          <li key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_9rem_1fr_auto]">
            <div className="col-span-2 sm:col-span-1">
              <TextField label="Company" value={c.name} maxLength={80} onChange={(name) => set(i, { name })} error={c.name.trim() ? null : "Required"} />
            </div>
            <SelectField label="ATS" value={c.ats} options={ATS} onChange={(ats) => set(i, { ats })} />
            <TextField label="Board token" value={c.token} maxLength={80} mono onChange={(token) => set(i, { token })} error={c.token.trim() ? null : "Required"} />
            <Button
              type="button"
              variant="ghost"
              className="col-span-2 h-11 justify-self-end text-danger sm:col-span-1 sm:h-9"
              aria-label={`Remove ${c.name || "company"}`}
              onClick={() => onChange({ ...value, companies: value.companies.filter((_, j) => j !== i) })}
            >
              <Trash2 aria-hidden />
              <span className="sm:sr-only">Remove</span>
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:h-8"
        disabled={value.companies.length >= MAX}
        onClick={() => onChange({ ...value, companies: [...value.companies, { name: "", ats: "greenhouse", token: "" }] })}
      >
        <Plus aria-hidden />
        Add company <span className="tabular text-ink-3">({value.companies.length} of {MAX})</span>
      </Button>
    </div>
  );
}
