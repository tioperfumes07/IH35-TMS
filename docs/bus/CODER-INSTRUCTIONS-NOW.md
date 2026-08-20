# CODER INSTRUCTIONS NOW · NO DEVIATE · CONTINUOUS · HOURLY RE-READ · FAST-MERGE

USMCA only. Fuel never. eld never. No QBO write-back. **No owner gate.** ALL QUESTIONS ASKED AND ANSWERED.

**Do not deviate.** This file + your `INBOX-<SEAT>.md` TOP are the only NOW. Chat summaries do not override.

## GOAL (owner 2026-08-20) — every scoreboard cell 4/4

Program → Module matrix. **Each Required cell has four boxes.** Complete means **all four ✓** on **every owed column**, every module except **fuel** and **eld**.

| Box | Name | Moves when |
|-----|------|------------|
| **1** | Required | Frozen `*.required.json` — do **not** add leaves |
| **2** | Audited | Mapping/GUARD/board exists (yellow until Built) |
| **3** | Built | Leaf-specific `@matrix-built` guard (no `leafRe:.*`) |
| **4** | Live | Devin Clicked `leaf=module:leafId:col \| USMCA` + healthz SHA |

**Columns (all of them, when Required on that leaf):**  
linkage = `driver` `customer` `vendor` `unit` `trailer` `load`  
money = `ap_bill` `expense` `gl_je` `liability` `invoice` `payment` `settlement` `bank` `factor` `escrow` (only if Required)  
chrome = `picker_law` `qbo_chrome`  
wiring = `connectivity` `reverse_link`

A cell that is ✓✓✓✕ is **not** done. Box 4 is Devin. Theater Built is forbidden. `Live=BLOCKED` on a module until that module’s Required cells are 4/4.

Law: `docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md` · Fully-Wired 1–12 · Honest Built.

## Continuous auto mode

Never idle. Never wait for Jorge. Unpaid 4/4 cell → next name in the wave. FAST-MERGE (`docs/bus/FAST-MERGE-4MIN-LAW.md`):

1. `cursor-ship-preflight --body-file` / `money-pr-local-gate` **exit 0**
2. `git push` — `--no-verify` only after step 1 PASS and only ENV `verify-static-fallback`
3. `gh pr create` — never `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` immediately
5. Neon yourself if money/migrations
6. OUTBOX one line → next unpaid cell same turn

## Hourly re-read

1. `git pull --ff-only origin main`
2. This file TOP to BOTTOM
3. Your `INBOX-<SEAT>.md` TOP
3b. **CC-2:** `OUTBOX-CC-2.md` first 20. **CC-1:** `OUTBOX-CC-1.md` first 20.
3c. Picker FAIL → prepend `OUTBOX-CC-2.md`. Money FAIL → `OUTBOX-CC-1.md`. Plus `OUTBOX-CURSOR.md`. Never chat-only.
4. `docs/bus/FAST-MERGE-4MIN-LAW.md`
5. ACK: `STANDARD=USMCA-LAUNCH | 4BOX-COMPLETE | HOURLY-REREAD | NOW=<module> <col> | GO`

## Waves (module order — still this sequence)

**WAVE 1:** banking → factoring → accounting → settlements → customers → drivers  
**WAVE 2:** insurance → legal → lists → safety → fleet → vendors → maintenance → dispatch  
**WAVE 3:** inventory → compliance → reports → cash-flow → finance → form_425 → users → docs → home → tasks → program  

Never fuel. Never eld.

## Seats (columns you own — fill boxes 2–3; Devin fills box 4)

| Seat | Boxes + columns | NOW → then |
|------|-----------------|------------|
| **Devin-A** | **Box 4 Live** every Required `leaf:col` | Continue WAVE 2 lists Clicked → safety → fleet → vendors → maintenance → dispatch → WAVE 3. One `leaf=module:leafId:col` per proof. `shipClickedOntoMain`. chrome=9227. Picker FAIL → OUTBOX-CC-2. |
| **CC-3** | **Box 3 Built** FE: `qbo_chrome` + surface-bar + leftover Built | WAVE 2 insurance Built → legal → lists → … every unpaid Built cell |
| **CC-1** | **Box 3 Built** money columns | WAVE 2 vendors money → dispatch → fleet → maint → insurance → legal. Reuse poster. Keep hop.bank. |
| **CC-2** | **Box 2/4** picker_law live-verify | GUARD regression unpaid picker_law cells (not re-loop 25/25 PASS). Rebuild only live FAIL. Read OUTBOX-CC-2. No poll. |
| **Codex** | **Box 3 Built** `reverse_link` + `connectivity` | WAVE 2 insurance reverse/connectivity → rest WAVE 2–3. No 9227. |
| **Cursor** | Lead + leftover Built + `qbo_chrome` + honest Required | Hourly INBOX; copy picker pings onto OUTBOX-CC-2; FAST-MERGE this file to main |

ACK: `STANDARD=USMCA-LAUNCH | 4BOX-COMPLETE | HOURLY-REREAD | NOW=<FO> | GO`
