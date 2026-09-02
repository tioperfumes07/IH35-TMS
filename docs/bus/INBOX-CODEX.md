# INBOX-CODEX · GO-26/27 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin` (or `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class (~54+ main env reds) — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

## ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY (2026-09-02)

**Driver pay = short miles always. NEVER practical.** Do not autofill/trust corrupted catalog short without OK popup.

Owner cost model (LOCKED): Customer RPM = rate/practical · Company CPM = cost/(practical+empty). Costs tab (Gate 2.2): wire empty into company cost view; driver pay on short miles only.

CC-1 owns catalog remediation. No mass lane_mileage correction.

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

## NOW

```
CODEX — GO-26 REINTRODUCTION GUARD + GO-27 GATE 2 COSTS TAB

Jorge UNLOCKED full capacity. WAIT is over.

1. After CC-2's ratchet lands, write the guard that stops a retired component
   coming back: no new file may import DataTable, ResizableTable,
   MobileOptimizedTable, SelectCombobox, EntityPicker or shared/Combobox.
   PROVE IT FAILS: check out a commit before the fix, run the guard, show it RED.
   A guard nobody has seen red is a green light with no bulb. Then show it green.

2. ORPHAN AUDIT. PR #19677 landed with EIGHT guards written but never wired into
   anything that runs them, and a cargo guard that rejected a VALID maintenance
   worker. Audit every guard for orphaned + false-positive failure modes.
   Report the list. Fix what is yours. Hand off what is not, by name.

3. DISPUTE TO SETTLE: GO-20 slice D (cargo sensor incidents) — verify live DB,
   report CONFIRM or DISPUTE with query.

4. GO-27 Gate 2.2 — LOAD COSTS TAB (13th tab on load detail).
   BLOCKED on Cursor Gate 2.1 (accounting.bills.driver_uuid).
   Expense-or-Bill toggle per row; calls existing endpoints only.
   Start design/wiring prep now; ship after driver_uuid lands.
```

ACK `CODEX | ACK | GO-26 reintro guard · Costs tab after driver_uuid · NEVER POST | GO`
