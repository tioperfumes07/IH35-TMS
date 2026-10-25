# ALL CODERS — FINAL-3 LAW (10-25-2026 6:00 PM CT) — read once, then work your file to the end

Owner, verbatim (5:57 PM): "give instructions to each coder final for all pending work testing fast merge law full and
complete coding mechanical economic money financial etc. each until they finish their job so you do not have to check in
and for them to search repo architecture blueprint docs anything journal registry so they do not pause and do not depend
on you. All finish no drifting condensing no circling. Job is only creating and coding no life verification do chrome yet."

## 1. How you work
- Work your FINAL-3 file top to bottom. When a row merges, start the next one. Do not stop between rows. Do not report
  until the whole file is done ("<SEAT> DONE" + PR list in your OUTBOX / last message).
- **Coding only.** No Chrome, no live clicking. The owner verifies.
- **Complete, never a shell.** Every row is the full thing: engine + wiring + UI + money/GL + reverse/void path + linkage
  (load, driver, unit, trailer, settlement, account) + guard. A screen that renders but is not wired is NOT done.
- **Never ask the Lead.** Answers live in: the repo code; `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`;
  `docs/design/v3/*` boards; `docs/bus/lead/LEAD-PENDING-REGISTER.md`; `docs/bus/lead/ENGINE-REGISTER.json`;
  `docs/bus/OWNER-AUTHORIZATIONS.md`; the claude.ai project docs `claude/00-*` (scope, accounting architecture, standing
  decisions); `~/Desktop/IH35-CLAUDE-JOURNAL.md`. If still unclear, choose the reading that matches the owner's words +
  the design law, write `ASSUMED:` in the PR body, and keep going.
- **Live data reads** (read-only): prod Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `SET LOCAL
  app.bypass_rls='lucia'` inside a transaction. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Transportation and
  Trucking are frozen.
- **Prod data repairs**: a script in `scripts/ops/`, dry-run by default, books-identical check, `--apply` only after the
  dry run is clean; rehearse on a Neon fork when it changes schema or posts money.

## 2. FAST 4-MINUTE WEEKEND MERGE (owner law, every seat, every PR)
1. Run the tests for what you touched + `cd apps/backend && npx tsc --noEmit -p .` (backend) and
   `cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b && npx vite build` (frontend).
2. Commit with the evidence block (FINDING / LANE / DOD-A..E / VERIFY-1..8 / MODULE_PROGRESS / ROOT CAUSE / FIX / GUARD /
   LIVE PROOF) and **name the row number** ("row 249").
3. `git push --no-verify`, open the PR, squash-merge immediately. Do not wait on the full gate.
4. A migration must apply on a Neon fork first and be claimed on main first (`db/migrations/CLAIMED-MIGRATION-NUMBERS.json`,
   your hour band). **Today a migration that was never applied blocked every API deploy for 20 minutes.**
5. If your merge turns main red (web build / API pre-deploy), fixing it is your next commit, before anything else.

## 3. Never
- Never create logins, users, email addresses or test/sample/demo records in USMCA. (3 fake admin logins caused 42 alarm
  emails to the owner, Martin and Alberto today — deactivated.)
- Never send email/SMS from a test, a script or a cron without a once-per-window rule.
- Never write the right-hand tables: `payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`,
  `mdata.qbo_vendors`, `catalogs.cancellation_reasons`, `catalogs.account_role_bindings` (legacy).
- Never JE-plug a balance. Clear through documents.
- Never auto-match bank lines.
- No forks / sub-agents (token cost). Tiered model.
