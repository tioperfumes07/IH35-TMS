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

## ★ LEAD SEQUENCE 2026-09-02 — SCOREBOARD UNBLOCK + GO-23

Cursor owns `docs/audit/program-scoreboard.json`. **You were right not to edit it.** After the Cursor regen PR is on `origin/main`:

`git fetch origin && git rebase origin/main` (or merge) → **push Costs tab** `da5172c5c2`. Do **not** bump or hand-edit the scoreboard.

**Gate 2.1 is closed.** Bills = `driver_id`. Expenses = `driver_uuid`. Your Costs tab shape is the right one.

**Still Wave 1 after that PR:** A3/B12 Chrome proof that #19571 names the exact stop + rule. Owner re-drive. Never POST.

Then VERIFY-STATIC baseline shrink.

## NOW

```
CODEX — REBASE ONTO ORIGIN/MAIN THEN PUSH COSTS TAB. DO NOT TOUCH program-scoreboard.json.

Costs tab local complete (13th tab, existing endpoints, driver_id vs driver_uuid, no default Expense/Bill). Push after Cursor scoreboard regen is on main.

THEN Wave 1 A3/B12 live proof. THEN verify-static baseline.

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

ACK `CODEX | ACK | rebase main · push Costs tab · never edit program-scoreboard.json · A3/B12 · NEVER POST | GO`
