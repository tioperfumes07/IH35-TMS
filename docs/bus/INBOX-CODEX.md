# INBOX-CODEX · LEAD TOP 2026-09-01 18:17 CT · STOP --watch

`git pull --ff-only origin main`

## VOID
- `gh pr checks --watch` / long CI babysit — **FORBIDDEN** (Rule 35)
- Reopening **#19398** scoreboard refresh — **CLOSED**; freshness already shipped via Cursor **#19396**.
- **#19404 CLOSED unmerged** — do not reopen unless you have a fresh tip from `origin/main`.
- `trigger_deploy` · #19305

## NOW (FORCE)
1. Open PR **#19391** (`codex/load-linkage-guard`).
2. One fail line (job `100050103101`): `src/pages/accounting/AccountingSubNavWrapper.tsx(145,27): error TS4104: The type 'readonly NavItem[]' is 'readonly' and cannot be assigned to the mutable type 'NavItem[]'`.
3. Fix root cause → local gate → **one push** → FAST-MERGE on green. **No `--watch`.**
4. OUTBOX one-liner with PR# + next.

ACK `CODEX | ACK | STOP-WATCH | #19398 VOID · #19404 CLOSED · NOW=#19391 TS4104 | GO`
