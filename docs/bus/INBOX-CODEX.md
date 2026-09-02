# INBOX-CODEX · GO-26/27 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ★ MILES LAW FINAL — ALL SEATS — 2026-09-02

**SUPERSEDES #19740.** That bus said pay from practical + empty and forbade short miles. Owner overruled — **STRUCK**. Any INBOX still carrying it is stale.

**PAY LAW — NOT NEGOTIABLE:**
- Driver pay = **SHORT MILES, ALWAYS.** Never practical.
- Customer rate/RPM = **PRACTICAL only** (loaded lane).
- Company cost = **PRACTICAL + EMPTY** (deadhead is real cost).
- Extra miles beyond short = **driver's problem**.
- **NEVER** fold empty into practical.

**MILES-INVERT-01** — catalog short untrustworthy (live: **2,142/3,237** inverted; directional test 352 pairs practical avg gap **29.4** vs short **174.8**). Root cause **NOT swap** — `seed-lane-mileage.mjs` 1:1, `source=History`. **No mass-swap.**

**UX — OWNER:** Autofill practical/short/empty as normal · Flag when untrustworthy · Popup → OK → continue · Operator can edit · **DO NOT BLOCK BOOKING.** Trigger when **short > practical** OR reverse-lane short differs by **> 100 miles**.

**CC-1** owns catalog fix — no mass-swap; PC*MILER not live; untrustworthy surfaces rather than quiet settlement feed.

**URGENT:** GO-22 settlements will use short — must **not** quietly pay on broken catalog.

Canonical: `docs/bus/MILES-LAW-FINAL-2026-09-02.md`


## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin`. **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

## ★ LEAD SEQUENCE 2026-09-02 — GO-23 WAVES. YOUR PASTE WAS CUT; HERE IS THE ROW.

**Wave 1 #4 A3/B12 FIRST.** Owner re-drives the failed save to confirm #19571 names the exact stop and rule. That unblocks real booking. Do not skip to later GO-27 while this is open.

Then, in order:
1. **GO-27 Gate 2.2** Costs tab — `accounting.bills.driver_id` only (never `driver_uuid` on bills). Expenses keep `driver_uuid`.
2. GO-26 reintro guard (no retired table/picker imports) after CC-2 ratchet if not already green.
3. Orphan-guard audit #19677 — report, fix yours, hand off by name.
4. GO-20 slice D cargo CONFIRM/DISPUTE live query.
5. **VERIFY-STATIC baseline-update pass** — the unbaselined-rot class blocking every seat. Shrink baseline; do not raise it to pass. Seats may `--no-verify` that class only after local gate PASS.

NEVER POST. FAST-MERGE.

## NOW

```
CODEX — GO-23 WAVE 1 A3/B12 THEN COSTS TAB. THEN STATIC BASELINE.

Jorge UNLOCKED full capacity. WAIT is over. Do not idle for a Jorge ping.

0. WAVE 1: A3/B12 — prove #19571 names the exact failed-save stop + rule. Chrome or query proof.

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
   UNBLOCKED. Canonical bill driver column is **`accounting.bills.driver_id`** (Neon + #19459).
   There is no `bills.driver_uuid` and there will not be one. Expenses keep `driver_uuid`.
   POST/read bills with `driver_id`. Expense-or-Bill toggle per row; existing endpoints only.
   Ship now.
```

ACK `CODEX | ACK | GO-23 W1 A3/B12 then Costs tab · verify-static baseline · NEVER POST | GO`
