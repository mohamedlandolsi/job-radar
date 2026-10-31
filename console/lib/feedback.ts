import { toast } from "sonner";

// Plain-sentence titles for known database error codes (jr_review, jr_flag_posting, jr_save_config, actions.ts).
// The verbatim error always goes in the description: database messages are written to be readable.
const KNOWN: [prefix: string, title: string][] = [
  ["invalid_transition", "That action is not allowed in this state"],
  ["fp_reason_required", "Pick why this match is not a fit"],
  ["notes_too_long", "Notes can be 2,000 characters at most"],
  ["nothing_to_save", "There is nothing to save"],
  ["unknown_action", "The database does not know that action"],
  ["not_found", "This match no longer exists"],
  ["invalid_input", "Some fields are too long or missing"],
];

export function errorTitle(error: string): string {
  return KNOWN.find(([prefix]) => error.startsWith(prefix))?.[1] ?? "That did not work";
}

export function toastError(error: string) {
  toast.error(errorTitle(error), { description: error });
}
