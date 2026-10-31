# Job Radar Console: rules for Claude Code

@AGENTS.md

## What this is
Private dashboard for Job Radar v2 (replaces the Discord digest). One user. Next.js 16.4 App Router,
Tailwind 4, shadcn/ui, Neon Postgres through @neondatabase/serverless (HTTP). Vercel Hobby, region fra1.
The schema lives in ../sql/radar_v2_schema.sql and the config shape in lib/config-schema.ts.
Read both before writing any query or form. The n8n workflow writes the data; this app reviews it and edits config.

## Data rules (hard)
- Never create, alter or drop tables, views or functions from app code. If a feature needs schema work, stop and give me the SQL.
- Read only from: v_jr_inbox, v_jr_health, v_jr_source_health, v_jr_gate_reasons, v_jr_dropped, v_jr_calibration,
  v_jr_fp_levers, v_jr_score_buckets, v_jr_active_config, and SELECT on jr_matches, jr_runs, jr_config_versions, jr_events.
- Write ONLY through the Server Actions in app/(console)/actions.ts (they call jr_review, jr_flag_posting,
  jr_save_config, jr_set_paused, jr_request_run). Never INSERT, UPDATE or DELETE directly.
- Only use the sql tagged template from lib/db.ts. Never concatenate SQL strings.
- Job descriptions are not stored anywhere. Do not add a column or a fetch for them; link out to the posting URL.
- bigint and count(*) arrive as strings: cast with ::int in SQL. timestamptz arrives as Date: convert to ISO strings
  before passing to Client Components. jsonb arrives as objects.
- DB access only in Server Components and Server Actions. Never import lib/db.ts from a "use client" file.

## Auth rules (hard)
- Do not edit lib/auth-token.ts, lib/session.ts, lib/db.ts, lib/config-schema.ts, proxy.ts, app/login/* or
  app/(console)/actions.ts unless I ask. These are hand-written or copied from gtm-console.
- Every page, layout, Server Action and route handler that touches data calls await requireSession() first.
  proxy.ts is not a security boundary.
- No public API routes, no analytics, no third-party scripts. robots: noindex.

## Next.js 16.4 rules
- Cache Components is ON. app/(console)/layout.tsx exports `instant = false`; keep it. Any new page outside (console)
  that reads cookies, params or searchParams also needs `export const instant = false`.
- Do not add "use cache" to anything that reads radar data.
- params and searchParams are Promises. Check node_modules/next/dist/docs before using an API you are unsure about.
- Keep next at ^16.4.3 or later (16.0 to 16.4.0 have the October 2026 RCE advisories).

## UI rules
- Mobile first: every screen must work at 390 px wide. Verdicts happen on a phone.
- shadcn/ui + Tailwind, same calm dense look as gtm-console. Reuse its components where they fit.
- Match status colors: new amber, good green, applied blue, interviewing violet, offer emerald, rejected gray,
  false_positive gray with strikethrough. Kind chip: job slate, gig teal. Priority: a small filled star.
- Reason codes are shown in plain words through lib/reasons.ts (one map, no inline strings).
- Show database error strings verbatim in a toast (they are written to be readable).
- No em dashes in any UI text. Use commas, colons or parentheses.

## Workflow
- Before coding, list the files you will create or change, then wait for "go".
- After every change run `npm run build` and fix all errors before saying done.
- Never print or commit secrets. .env.local stays local.
