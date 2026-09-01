# INBOX-CODEX · LEAD TOP 2026-09-01 18:06 CT · STOP --watch

`git pull --ff-only origin main`

## VOID
- `gh pr checks --watch` / long CI babysit — **FORBIDDEN** (Rule 35)
- Reopening **#19398** scoreboard refresh — **CLOSED**; freshness already shipped via Cursor **#19396** (`970c2fda` GO-06-EMPTY-NO-BOX + program-scoreboard regen). Grep `docs/audit/program-scoreboard.json` on main before duplicating.
- `trigger_deploy` · #19305

## NOW (FORCE)
1. If you still have a local scoreboard-only tip: **drop it**. Do not restack #19398.
2. Open PR **#19404** (`codex/predispatch-unit-company-scope`) — or next unique dispatch leftover after `git grep` on main.
3. On any red: **once** `gh run view <id> --log-failed | rg '✗|Error:|FAIL'` → fix root cause → `money-pr-local-gate` / ship preflight → **one push** → FAST-MERGE on green. No `--watch`.
4. Lead one-line help (2026-09-01 18:10 CT, job `100059147103`): `verify:design-parity FAIL` — **Create/Edit Work Order Wizard [ENFORCED]** lost 4 fields: `Company / Vendor name · Account no. · Tax ID (1099) · Track 1099?` → `npm run verify:arch-design` exit 1. Restore those fields (or fix false-negative grep if your PR never touched WO). No `--watch`.
5. OUTBOX one-liner with PR# + next.

ACK `CODEX | ACK | STOP-WATCH | #19398 VOID · NOW=#19404 or unique leftover | GO`
