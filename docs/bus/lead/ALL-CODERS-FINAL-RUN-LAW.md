# ALL CODERS — FINAL RUN LAW (owner 10-24-2026 8:54 PM CT) — read once, then work to the end without stopping

OWNER (verbatim): "give instructions to each coder final for all pending work testing fast merge law full and complete coding mechanical economic money financial etc. each until they finish their job … search repo architecture blueprint docs anything journal registry so they do not pause and do not depend on you. All finish no drifting condensing no circling. Job is only creating and coding no live verification do chrome yet."

1. **Scope.** Your box plus your `10-24-2026-<SEAT>-PENDING-ROWS-FINAL.md` (in Downloads) is your whole job.
   - Work top to bottom until every row is coded and merged. Then report "SEAT DONE" with the PR list. Nothing else.
2. **Do not pause and do not ask the Lead.** Answer your own questions from these sources, in this order:
   - the repo code;
   - `docs/` (architecture, blueprints, specs, `docs/law/LAW.json`, `docs/bus/OWNER-AUTHORIZATIONS.md`, `docs/reconciliation/`);
   - the claude.ai project doc `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`;
   - the register `docs/bus/lead/LEAD-PENDING-REGISTER.md` (branch claude/lead-engine-register-2412);
   - `~/Desktop/IH35-CLAUDE-JOURNAL.md`;
   - the design repo / design canvas referenced in the row;
   - the live DB, read-only, with `SET LOCAL app.bypass_rls='lucia'`.
   - If a fact is still missing, pick the reading that matches existing code and law, write it on one line in the PR body (`ASSUMED: …`), and keep going.
3. **Coding only.**
   - No Chrome, no screen walks, no "live verification" step; the owner verifies at the end.
   - Every row must be **fully built**: backend + DB + frontend, wired end to end (nav → page → API → Neon), with economics and money correct (GL legs balanced, R12 net-on-A/P, suggest-only bank matching, USMCA only), and design at 100%.
   - No shells, no placeholders, no TODOs, no "phase 2".
4. **Fast 4-minute merge law.** Use one PR per row or per tight group of rows.
   - Run `node scripts/money-pr-local-gate.mjs` **once**, push **once**, then squash-merge immediately: `gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash`.
   - If a guard that is red **on main too** blocks you, it is not yours: note it in the PR body and keep moving. If it is yours, fix the root cause; never add an allowlist entry.
   - No idle PRs. No re-running a gate that already passed.
5. **Tiered model, least tokens.**
   - Main session runs Sonnet (`/model sonnet`).
   - Searches, reads and census go to Haiku helpers.
   - Opus only for designing money-engine logic.
   - Grep and tail; never cat whole files or logs. Replies to the Lead are 5 lines or fewer.
6. **No drift, no circling, no condensing.**
   - Do not re-audit what a row already states. Do not open audits of your own.
   - Do not "summarize the plan" — code it.
   - Do not touch another seat's files unless your row needs it. If it does, add `SURFACE-BREACH-AUTHORIZED: <owning seat> <reason>` to the commit body.
   - Before fixing a red that is outside your lane, check that no one else is already fixing it. Today CC-3 and the Lead both fixed HosTrackerSection.
7. **Prod data writes are not in your job.**
   - Code the engine and write the ops script with a `--dry-run` default that calls `scripts/verify-owner-authorization.mjs`.
   - Put the dry-run numbers in the PR body. The Lead applies under an AUTH after a fork rehearsal.
   - Never write test or sample records to USMCA. Never auto-match bank lines.
8. **Commit shape the hooks require** (copy from any merged Lead PR, e.g. #27577):
   - FINDING / LANE / DOD-A..E / VERIFY-1..8 / `MODULE_PROGRESS: accounting 38 of 40` + `banking 19 of 20` / ROOT CAUSE / FIX / GUARD (wired in `scripts/verify-steps/`) / LIVE PROOF (guard exit 0 + count) / REMAINING / a `Live=` line / MIGRATE (+ REHEARSED for data migrations).
   - Claim migration numbers in `CLAIMED-MIGRATION-NUMBERS.json` first. Check main for collisions; today 202616240400 collided.
9. **Done means coded + merged + deployed.** The Lead watches Render and the queue; you do not wait for the deploy.
