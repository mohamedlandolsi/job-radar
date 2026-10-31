"use client";

import { useMemo } from "react";
import { parseConfigText } from "@/lib/config-schema";
import { Button } from "@/components/ui/button";

// Advanced JSON: the whole document, validated with the same zod mirror as the form.
export function JsonTab({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const check = useMemo(() => parseConfigText(text), [text]);
  function format() {
    try {
      onChange(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* invalid JSON: the error list already says why */
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-ink-3">
          The full config. The &quot;rev&quot; here is replaced by the New rev field when you save.
        </p>
        <Button type="button" variant="outline" className="h-11 sm:h-8" onClick={format}>
          Format
        </Button>
      </div>
      <label htmlFor="config-json" className="sr-only">
        Config JSON
      </label>
      <textarea
        id="config-json"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={28}
        aria-invalid={check.ok ? undefined : true}
        className="block w-full rounded-md border border-input bg-card p-3 font-mono text-[0.75rem] leading-relaxed aria-invalid:border-danger"
      />
      {check.ok ? (
        <p className="text-[0.8125rem] text-state-approved">Valid config.</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-[0.75rem] text-danger" aria-label="JSON problems">
          {check.errors.map((e) => (
            <li key={e} className="[overflow-wrap:anywhere]">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
