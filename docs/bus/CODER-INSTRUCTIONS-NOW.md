# CODER INSTRUCTIONS NOW · NO DEVIATE · CONTINUOUS · HOURLY RE-READ · FAST-MERGE

USMCA only. No QBO write-back. **No owner gate.** ALL QUESTIONS ASKED AND ANSWERED.

**Do not deviate.** This file + your `INBOX-<SEAT>.md` TOP are the only NOW. Chat summaries do not override.

## How we work (owner 2026-08-20 · researched · LAW)

**Swarm one module.** All seats work the **same NOW module** at once, each on **their column only**. Do **not** give each coder a whole module to finish every column (Devin cannot post GL; CC-1 must not CDP; two money PRs collide — Rule 27).

Industry: swarm the current slice (Pierrain squads+swarm; feature-swarm cycle time; agent swarms need a task graph + one merge queue). Our graph = WAVE 1 module list. Our columns = seat table below.

**NOW module = accounting** until Box 1–4 100% **and** Miss C 0 **including money** on that module. Then the next WAVE 1 name.

Devin idle because the Clicked queue skipped money is a **defect**. Rebuild includes money. Waiting for new `required.json` is **forbidden**.

## Owner 2026-08-20 13:51 · BAR (eyeballed on live `/program/matrix` USMCA)

Logged-in system rollup (Cursor eyeball, not OUTBOX): Box 1 **3365/3365** · Box 2 **3365/3365** · Box 3 **3365/3365** (wire-only fill still shown; Built count is 100%) · Box 4 Live **3078/3365 (91%)** · Frozen Clicked **3145/3145** · **Miss C 0/3145** on this deploy (copy still says MONEY parked — SHA lag vs #13050; do not treat parked as law).

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

Accounting board **346 Required · 346 Built · 340 Live · Queue 6**. Exact Live ✕ leaves: `accounting.parity.credit_memos_page` (2 cols) · `banking.panel.linked_bank_transactions` (4 cols). CC-2 stamps those six. banking / factoring / settlements still re-prove Box 4 100% then WAVE 2. Do not idle on Miss C 0 while Box 4 Live < 100%.

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
| **CC-2** | **Box 4 Live** | Accounting Queue 6: `accounting.parity.credit_memos_page` (2 cols) + `banking.panel.linked_bank_transactions` (4 cols). Then customers → drivers → WAVE 2. |
| **Devin-A** | 12 Clicked / Miss C | Those six `leaf=accounting:<leafId>:<col>` USMCA. Rebuild includes money. chrome=9227. |
| **CC-3** | Built 1–11 FE | Box 3 **3365/3365** on live rollup. WAVE 2 Built leftover. Not 9227. Not GL. |
| **CC-1** | money, reuse poster | `banking.panel.linked_bank_transactions` bank+gl_je on USMCA. Money not parked. F5602–F5619 stand. |
| **Codex** | reverse_link | Credit-memos + linked-bank reverse on accounting, then WAVE 2. No 9227. |
| **Cursor** | lead + leftover Built + scoreboard | USMCA-only switcher. FAST-MERGE. Box 4 = CC-2. |

ACK: `STANDARD=USMCA-LAUNCH | SWARM-ONE-MODULE | HOURLY-REREAD | NOW=<FO> | GO`
