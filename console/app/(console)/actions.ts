"use server";

// Job Radar console: every write goes through a jr_* function in Postgres (rules live there).
// Hand-written on purpose (guarded file). Mirrors gtm-console/app/(console)/queue/actions.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { parseConfigText } from "@/lib/config-schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

const dbError = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : "db_error" });

const ReviewInput = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/),
  action: z.enum(["good", "false_positive", "applied", "interviewing", "offer", "rejected", "reopen", "save_notes"]),
  fp_reason: z
    .enum(["seniority", "experience", "location", "work_mode", "language", "visa", "skills", "role_type", "duplicate", "stale", "other"])
    .optional(),
  notes: z.string().max(2000).optional(),
});

// State machine and audit log: jr_review() in radar_v2_schema.sql.
export async function reviewMatch(input: z.input<typeof ReviewInput>): Promise<ActionResult> {
  await requireSession();
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { id, action, fp_reason, notes } = parsed.data;
  const payload: Record<string, string> = {};
  if (fp_reason) payload.fp_reason = fp_reason;
  if (notes !== undefined) payload.notes = notes;
  try {
    await sql`select jr_review(${id}, ${action}, ${JSON.stringify(payload)}::jsonb, 'console')`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath(`/m/${id}`);
  return { ok: true };
}

const FlagInput = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/),
  flag: z.enum(["false_negative"]).nullable(),
  note: z.string().max(500).optional(),
});

// "Should have passed" on the Filtered screen. jr_flag_posting() refuses rows that were not dropped.
export async function flagPosting(input: z.input<typeof FlagInput>): Promise<ActionResult> {
  await requireSession();
  const parsed = FlagInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { id, flag, note } = parsed.data;
  try {
    await sql`select jr_flag_posting(${id}, ${flag}, ${note ?? null}, 'console')`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/filtered");
  return { ok: true };
}

// Config: zod shape + JavaScript regex compile here, budgets and invariants in jr_save_config().
export async function saveConfig(input: { text: string; note?: string }): Promise<ActionResult> {
  await requireSession();
  if (typeof input?.text !== "string" || input.text.length > 100_000) return { ok: false, error: "invalid_input" };
  const parsed = parseConfigText(input.text);
  if (!parsed.ok) return { ok: false, error: parsed.errors.join("\n") };
  const note = (input.note ?? "").slice(0, 300) || null;
  try {
    await sql`select jr_save_config(${input.text}, ${note}, 'console')`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/config");
  revalidatePath("/sources");
  revalidatePath("/runs");
  return { ok: true };
}

export async function setPaused(paused: boolean): Promise<ActionResult> {
  await requireSession();
  if (typeof paused !== "boolean") return { ok: false, error: "invalid_input" };
  try {
    await sql`select jr_set_paused(${paused}, 'console')`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/runs");
  return { ok: true };
}

// The laptop schedule (every 30 minutes, 07:00 to 22:30) picks the request up; at most 3 runs a day.
export async function requestRun(): Promise<ActionResult> {
  await requireSession();
  try {
    await sql`select jr_request_run('console')`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/runs");
  return { ok: true };
}
