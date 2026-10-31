"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Chips plus a text box. Enter or comma adds (comma only when commas cannot be part of a value), x removes,
// Backspace on an empty box removes the last chip. Duplicates are ignored.
export function TagInput({
  label,
  values,
  onChange,
  max,
  placeholder,
  allowCommas = false,
  validate,
  normalize,
  mono = false,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  placeholder?: string;
  allowCommas?: boolean;
  validate?: (v: string) => string | null;
  normalize?: (v: string) => string;
  mono?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = values.length >= max;

  function add(raw: string) {
    const v = (normalize ? normalize(raw.trim()) : raw).trim();
    if (!v) return;
    if (values.includes(v)) {
      setError(`"${v}" is already in the list`);
      return;
    }
    if (full) {
      setError(`${max} at most`);
      return;
    }
    const problem = validate?.(v) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...values, v]);
    setText("");
    setError(null);
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[0.8125rem] font-medium text-muted-foreground">
        {label}
        <span className="tabular text-[0.75rem] font-normal text-ink-3">
          {values.length} of {max}
        </span>
      </label>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((v) => (
            <li
              key={v}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md border bg-card py-1 pr-1 pl-2 text-[0.8125rem]",
                mono && "font-mono text-[0.75rem]",
              )}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{v}</span>
              <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-secondary hover:text-foreground sm:size-5"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        value={text}
        disabled={full}
        placeholder={full ? `${max} at most` : (placeholder ?? "Type and press Enter")}
        onChange={(e) => {
          setError(null);
          const v = e.target.value;
          if (!allowCommas && v.endsWith(",")) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && text === "" && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add(text)}
        className={cn(
          "h-11 w-full rounded-md border border-input bg-card px-2.5 text-[0.9375rem] sm:h-9 sm:text-[0.8125rem]",
          mono && "font-mono",
        )}
      />
      {error ? <p className="text-[0.8125rem] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
