# INBOX-CC-1 · 9223 · MODULE LOCK = ACCOUNTING

`git pull --ff-only origin main`. FAST-MERGE 4–5 min. USMCA. Reuse poster. No new GL math.

**LEAD 2026-08-21 19:07 CT — OWNER: all seats on one module until finished.** **NOW MODULE = ACCOUNTING.** Do not jump to settlement close / banking categorize. Categorize is not a coder job.

**NOW:**
1. `ACCT-REGISTER-REF-IS-SOURCE-UUID` — `account-register.service.ts` `reference` must be a human document id, not `source_transaction_id` UUID. Mutation guard.
2. JE source-link human labels on live SHA after batch deploy (ACCT-F5708 on main, not `fe62c92`).
3. Expenses list: **Vendor — not visible** (4 live, SHA `fe62c92`) — join/payload, not Match/Categorize.
4. Worker OFF. Cron stagger still allowed as code-only if it does not leave Accounting.

## PASTE BOX

```text
===== CC-1 · PORT 9223 · ACCOUNTING ONLY =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
LAW: lockstep module=accounting until leftover dry · FAST-MERGE 4MIN
FORBIDDEN: categorize/match · settlements/factoring this tick · trigger_deploy · worker ON

NOW:
  1) ACCT-REGISTER-REF-IS-SOURCE-UUID
  2) JE/bill human source labels
  3) expense vendor join tombstones (4 live)
THEN: wait Cursor “MODULE accounting leftover dry” before banking.

ACK: CC-1 | ACK | INBOX-CC-1 | PORT=9223 | NOW=ACCOUNTING register+JE+vendor join | GO
===== END CC-1 =====
```
