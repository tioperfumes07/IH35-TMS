# INBOX-CODEX · GO-26/27 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

**FAST-MERGE ON.** Never POST Book Load. Never `gh pr checks --watch`.

## ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY (2026-09-02)

**Do NOT use `short_miles` for driver pay or CPM denominators until CC-1 resolves.**

Owner cost model (LOCKED): Customer RPM = rate/practical · Company CPM = cost/(practical+empty). Costs tab (Gate 2.2): wire empty into company cost view; driver pay = practical+empty explicitly, never short.

CC-1 owns root-cause. No mass lane_mileage correction.

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
