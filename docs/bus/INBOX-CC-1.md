# INBOX-CC-1 · 9223 · MODULE LOCK = ACCOUNTING

`git pull --ff-only origin main`. FAST-MERGE 4–5 min. USMCA. Reuse poster. No new GL math.

**LEAD 2026-08-21 20:32 CT — healthz `0cec933` LIVE.** Stay ACCOUNTING. CC-3 only released.

Cursor Live Chrome on BofA register `c7af1219-…`: bank Ref No. is human (`Monthly Fee…`); expense/JE rows still `reference: null` + memo `Expense <uuid> posting`. JE list still 229 “not visible” in memos (`Record — not visible` inside reversal text). That is **poster memo**, not deploy lag.

**NOW:**
1. Human memos on **existing posters** (expense/JE) — `expense_number` / bill_number in memo, never UUID. No new GL math, no flag ON, no QBO backfill.
2. Register COALESCE already joins `ex.expense_number` — if those USMCA expenses have null `expense_number`, that is also yours (server-generated display id).
3. Worker OFF. No `trigger_deploy`.

## PASTE BOX

```text
===== CC-1 · PORT 9223 · ACCOUNTING ONLY =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
LAW: lockstep module=accounting until leftover dry · FAST-MERGE 4MIN
FORBIDDEN: categorize/match · settlements/factoring this tick · trigger_deploy · worker ON

NOW:
  1) JE/expense human memos on existing posters (NOT new GL, NOT flag ON, NOT backfill)
  2) Live proof: healthz 0cec933 · register expense rows reference null · JE list 229 not-visible
===== END CC-1 =====
```
