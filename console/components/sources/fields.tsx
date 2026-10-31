"use client";

import { useId } from "react";
import type { RadarConfig } from "@/lib/config-schema";
import { cn } from "@/lib/utils";

export type Sources = RadarConfig["sources"];
export type LinkedIn = Sources["linkedin"];
export type LinkedInSearch = LinkedIn["searches"][number];
export type Reddit = Sources["reddit"];
export type Ats = Sources["ats"];
export type AtsCompany = Ats["companies"][number];
export type Board = Sources["boards"][number];

export const INPUT =
  "h-11 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-[0.9375rem] sm:h-9 sm:text-[0.8125rem] aria-invalid:border-danger";
const LABEL = "block text-[0.8125rem] font-medium text-muted-foreground";

export function FieldError({ children }: { children: React.ReactNode }) {
  return children ? <p className="text-[0.8125rem] font-medium text-danger">{children}</p> : null;
}

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  mono = false,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  mono?: boolean;
  error?: string | null;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT, mono && "font-mono")}
        spellCheck={!mono}
      />
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const id = useId();
  const bad = !Number.isInteger(value) || value < min || value > max;
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label} <span className="font-normal text-ink-3">({min} to {max})</span>
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={bad ? true : undefined}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className={cn(INPUT, "tabular")}
      />
      {bad ? <FieldError>{`Whole number from ${min} to ${max}`}</FieldError> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Multi-select as checkboxes (LinkedIn work types and experience levels).
export function CheckGroup<T extends string>({
  label,
  options,
  values,
  onChange,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  values: readonly T[];
  onChange: (v: T[]) => void;
  error?: string | null;
}) {
  return (
    <fieldset className="min-w-0 space-y-1">
      <legend className={LABEL}>{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-[0.8125rem] sm:min-h-8",
                on ? "border-foreground bg-secondary font-medium" : "bg-card",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={on}
                onChange={(e) => onChange(e.target.checked ? options.filter((x) => x.value === o.value || values.includes(x.value)).map((x) => x.value) : values.filter((v) => v !== o.value))}
              />
              {o.label}
            </label>
          );
        })}
      </div>
      <FieldError>{error}</FieldError>
    </fieldset>
  );
}

// Plain JavaScript regex check, same rule as lib/config-schema.ts (flags "i").
export function regexError(s: string): string | null {
  if (!s.trim()) return "Required";
  try {
    new RegExp(s, "i");
    return null;
  } catch (e) {
    return `Not a valid JavaScript regex: ${e instanceof Error ? e.message : String(e)}`;
  }
}
