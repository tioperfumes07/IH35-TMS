# CODER INSTRUCTIONS NOW · NO DEVIATE · CONTINUOUS · HOURLY RE-READ · FAST-MERGE

USMCA only. No QBO write-back. **No owner gate.** ALL QUESTIONS ASKED AND ANSWERED.

**Do not deviate.** This file + your `INBOX-<SEAT>.md` TOP are the only NOW. Chat summaries do not override.

## How we work (owner 2026-08-20 · researched · LAW)

**Swarm one module.** All seats work the **same NOW module** at once, each on **their column only**. Do **not** give each coder a whole module to finish every column (Devin cannot post GL; CC-1 must not CDP; two money PRs collide — Rule 27).

Industry: swarm the current slice (Pierrain squads+swarm; feature-swarm cycle time; agent swarms need a task graph + one merge queue). Our graph = WAVE 1 module list. Our columns = seat table below.

**NOW module = accounting** until Box 1–4 100% **and** Miss C 0 **including money** on that module. Then the next WAVE 1 name.

Devin idle because the Clicked queue skipped money is a **defect**. Rebuild includes money. Waiting for new `required.json` is **forbidden**.

## Owner 2026-08-20 13:01 · BAR (eyeballed on live `/program/matrix` USMCA)

Logged-in system rollup (Cursor eyeball, not OUTBOX): Box 1 **3365/3365** · Box 2 **3364/3365** · Box 3 **3362/3365** (9% wire-only = Built-not-Live) · Box 4 Live **3070/3365 (91%)** · Frozen Clicked **3112/3145** · **Miss C 33/3145**.

**100% on a module means ALL of these on that module, then the software totals:**

1. **Original 4 boxes** — Required · Audited · Built · **Live** all **100%** (denominator = that module’s Required cells; software target **3365 of 3365** on every box).
2. **Miss C = 0** on Frozen Clicked **including money** (#13050). Do not treat a pre-unpark Miss C as drained.
3. **Built wire complete** — **0** Built-only cells (the 9% wire-only must become **Live**, not more chrome).
4. **Fully-Wired 1–12** — item 12 last (Devin Clicked). Until 12: say `Built` / `Live=BLOCKED` on the module.

**Box 4 Live ≠ Clicked.** `cell.live` = `AUDIT-COVERAGE-LIVE` **PROD-VERIFIED** with **explicit leaf id** + **Exact cells:** / `Leaves:` `` `leaf:col` `` (see `leafColumnLiveReason`). Keyword fan-out is illegal. Devin OUTBOX LIVE PASS credits **Clicked / Miss C / FW-12**, not Box 4.

**Miss C:** money cells count. Devin rebuilds unpaid Clicked from required.json vs OUTBOX **including money**. Fuel/system/driver-hub still in WAVE 3. eld never. No QBO write-back.

## Six most urgent = WAVE 1 first (then rest of urgent = WAVE 2, then WAVE 3)

Finish WAVE 1 to the BAR above **before** treating WAVE 2 as NOW.

**WAVE 1 (the 6):** banking → factoring → accounting → settlements → customers → drivers  
**WAVE 2 (rest of urgent):** insurance → legal → lists → safety → fleet → vendors → maintenance → dispatch  
**WAVE 3:** inventory → compliance → reports → cash-flow → finance → form_425 → users → docs → home → tasks → program → **driver-hub → system → fuel** (Miss C remainder)

Live 4th-box ✕ still on WAVE 1 (same eyeball): **accounting 10 · customers 1 · drivers 2**. banking / factoring / settlements had **0** 4th ✕ — still re-prove Box 4 **100%** on those three, then move. Do not idle on a green Miss C while Box 4 Live < 100%.

## Continuous auto mode

Never idle. Never wait for Jorge. FAST-MERGE every FO (`docs/bus/FAST-MERGE-4MIN-LAW.md`):

1. `cursor-ship-preflight --body-file` / `money-pr-local-gate` **exit 0** (merge proof)
2. `git push` — if blocked **only** by ENV `verify-static-fallback`, `git push --no-verify` **after** step 1 PASS
3. `gh pr create` — **never** `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` **immediately**
5. Neon yourself if money/migrations
6. OUTBOX one line → next FO same turn

## Hourly re-read (no exceptions · redundant on purpose)

**Every hour, every seat including Cursor:**

1. `git pull --ff-only origin main`
2. Re-read this file TOP to BOTTOM
3. Re-read your `INBOX-<SEAT>.md` TOP
4. Re-read `docs/bus/FAST-MERGE-4MIN-LAW.md`
5. Re-ACK: `STANDARD=USMCA-LAUNCH | SWARM-ONE-MODULE | HOURLY-REREAD | NOW=<module> <col> | GO`
6. Keep the same chain — do not invent a new queue

## Seats (same waves, different columns — no crossing)

| Seat | Column | NOW |
|------|--------|-----|
| **CC-2** | **Box 4 Live** | WAVE 1 accounting first (10 Live gaps) → customers → drivers → re-prove banking/factoring/settlements → WAVE 2 → WAVE 3. Append **PROD-VERIFIED** rows with explicit `` `leaf` `` + `Exact cells:` / `Leaves:`. Picker rebuild **only** on live FAIL. |
| **Devin-A** | 12 Clicked / Miss C | **NOT DRAINED.** Rebuild queue (`--rebuild-only`) **including money**. NOW=**accounting money Clicked** → rest WAVE 1 unpaid → WAVE 2 → WAVE 3. Never wait for new required.json. chrome=9227. Never STARVED merge. |
| **CC-3** | Built 1–11 FE | Remaining **3** system Built gaps (Box 3 **3362/3365**) then WAVE 1 leftover Built → WAVE 2 → WAVE 3. Not 9227. Not GL. Wire-only closes when CC-2 Live-credits the cell. |
| **CC-1** | money, reuse poster | WAVE 1 accounting money Live gaps (UNIT etc Live 0% with Built 100%) → banking → factoring → settlements → WAVE 2 money. F5602–F5619 stand. No manufacture. |
| **Codex** | reverse_link | WAVE 1 leftover reverse → WAVE 2 → WAVE 3. No 9227. |
| **Cursor** | lead + leftover Built + scoreboard | Re-instruct this BAR hourly. FAST-MERGE INBOX to main. Item 12 = Devin. Box 4 = CC-2 ledger. |

ACK: `STANDARD=USMCA-LAUNCH | SWARM-ONE-MODULE | HOURLY-REREAD | NOW=<FO> | GO`
