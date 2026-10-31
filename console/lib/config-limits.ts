// Limits read from radarConfigSchema itself (zod 4 exposes minValue / maxValue / isInt and length checks),
// so the form can never drift from lib/config-schema.ts. Pure: safe for Client Components.
import { radarConfigSchema } from "@/lib/config-schema";

type Node = {
  shape?: Record<string, Node>;
  minValue?: number | null;
  maxValue?: number | null;
  isInt?: boolean;
  options?: string[];
  element?: Node;
  def?: { type?: string; innerType?: Node; checks?: { _zod?: { def?: { check?: string; maximum?: number; minimum?: number } } }[] };
};

function at(path: string): Node {
  let n = radarConfigSchema as unknown as Node;
  for (const k of path.split(".")) {
    if (n.def?.type === "optional" && n.def.innerType) n = n.def.innerType;
    const next = n.shape?.[k];
    if (!next) throw new Error(`config-limits: no schema at ${path}`);
    n = next;
  }
  if (n.def?.type === "optional" && n.def.innerType) n = n.def.innerType;
  return n;
}

export function numLimits(path: string): { min: number; max: number; integer: boolean } {
  const n = at(path);
  return { min: n.minValue ?? 0, max: n.maxValue ?? Number.MAX_SAFE_INTEGER, integer: Boolean(n.isInt) };
}

export function listMax(path: string): number {
  const checks = at(path).def?.checks ?? [];
  const max = checks.map((c) => c._zod?.def).find((d) => d?.check === "max_length")?.maximum;
  return max ?? 500;
}

export function enumOptions(path: string): string[] {
  const n = at(path);
  return n.options ?? n.element?.options ?? [];
}
