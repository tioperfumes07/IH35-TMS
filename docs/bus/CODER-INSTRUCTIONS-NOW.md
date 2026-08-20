# CODER INSTRUCTIONS NOW · NO DEVIATE · CONTINUOUS · HOURLY RE-READ · FAST-MERGE

USMCA only. Fuel never. eld never. No QBO write-back. **No owner gate.** ALL QUESTIONS ASKED AND ANSWERED.

**Do not deviate.** This file + your `INBOX-<SEAT>.md` TOP are the only NOW. Chat summaries do not override.

## GOAL — 4 boxes on the **existing** matrix columns (do not invent a second set)

Program → Module matrix (`/program/matrix`). **Each Required cell has four boxes** (Required · Audited · Built · Live). That is the checkmark bar.

**Do not add columns.** Law: Honest Built — *Do not add scoreboard columns.* Canonical ids are **only** `docs/specs/scoreboard/columns.shared.json` (**25** ids). Modules subset them in `*.required.json`.

| What | What it is | What it is NOT |
|------|------------|----------------|
| **25 matrix columns** | Shared vocabulary: **12 linkage** (`driver` `customer` `vendor` `unit` `trailer` `load` `claim` `work_order` `accident` `policy` `settlement` `legal_matter`) + **7 money** (`ap_bill` `expense` `invoice` `bank` `gl_je` `inventory` `liability`) + **2 chrome** (`picker_law` `qbo_chrome`) + **2 wiring** (`connectivity` `reverse_link`) + **2 process** (`scenario.maintenance` `scenario.insurance`) | Not a new queue |
| **12 linkage columns** | Owner 2026-08-12: §B9 hub types **as columns** (claim/WO/accident/policy/settlement/legal_matter **plus** the 6 hubs). This **is** the consolidation of the old class wall | Do **not** also sweep the archived 31 CLS columns as if they were extra matrix cols |
| **~31 CLS columns** | Archived class board `/program/legacy-scoreboard` — `CLASS_SCOREBOARD.summary.total = 31` from `wave-queue.json` (CLS-BANK-MATCH-DENSITY, CLS-REVERSE-LINKAGE-MISSING, CLS-DISP-WIRE-01…10, …) | **Not** the live matrix. Do not rebuild that board |
| **Fully-Wired 1–12** | Depth bar (create → canonical → money → F+R → surface → **Live Chrome last**) | **Not** 12 extra scoreboard columns |

**Forbidden extra ids (not in `columns.shared.json`):** `payment` `factor` `escrow` as their own columns. Escrow/factoring liability = **`liability` (LIAB/ESCR)**. Customer payment / match = **`invoice` / `bank` / `ap_bill`**. `settlement` is a **linkage** column, not a second money column.

`liability` already means LIAB/ESCR. Wiring `reverse_link` already covers CLS-REVERSE-LINKAGE-MISSING / CLS-LINKAGE-ONEWAY. `connectivity` covers nav→API. `picker_law` / `qbo_chrome` cover calendar/orphan-surface chrome classes. **Same work — do not run it twice.**

A cell that is ✓✓✓✕ is **not** done. Box 4 = Devin `leaf=module:leafId:col`. No `leafRe:.*` Built. Never fuel/eld.

Law: `columns.shared.json` · `VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md` · `MODULE-MATRIX-SCOREBOARD-LOCKED.md` · Fully-Wired 1–12 · Honest Built.


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
5. ACK: `STANDARD=USMCA-LAUNCH | URGENT-6 | 4BOX-COMPLETE | HOURLY-REREAD | NOW=<module> <col> | GO`

## NOW — chat urgent 14 (owner 2026-08-19). Operational live = 4/4 on these modules.

**URGENT-6 (do these first, all seats, same hour, split columns):**  
1 accounting → 2 customers → 3 drivers → 4 vendors → 5 dispatch → 6 safety

**THEN remaining of the 14 (chat items 7–14; skip fuel):**  
7 fleet → 8 maintenance → 9 lists → 10 settlements → 11 factoring → 12 banking → 14 inventory

**THEN** insurance · legal · cash-flow · finance · remainder of sidebar.

Never fuel. Never eld. Do not park vendors or dispatch — they are in the 6.

Unpaid 4/4 cell in URGENT-6 in your column → that cell. Do not wander to insurance/WAVE-2 leftovers while URGENT-6 unpaid exists in your lane.

## Seats (columns you own — fill boxes 2–3; Devin fills box 4)

| Seat | Boxes + columns | NOW → then |
|------|-----------------|------------|
| **Devin-A** | **Box 4 Live** every Required `leaf:col` | **accounting** Clicked → customers → drivers → vendors → dispatch → safety. Then fleet→…→inventory. `leaf=module:leafId:col`. `shipClickedOntoMain`. chrome=9227. Picker FAIL → OUTBOX-CC-2. |
| **CC-3** | **Box 3 Built** FE: `qbo_chrome` + surface-bar | **accounting** unpaid Built → customers → drivers → vendors → dispatch → safety |
| **CC-1** | **Box 3 Built** money columns | **accounting** money unpaid → customers/drivers/vendors/dispatch/safety money cells. Reuse poster. Keep hop.bank. Then settlements→factoring→banking→inventory. |
| **CC-2** | **Box 2/4** picker_law live-verify | Unpaid **picker_law** on URGENT-6 (accounting first). Rebuild only live FAIL. Read OUTBOX-CC-2. No poll. No 25/25 re-loop. |
| **Codex** | **Box 3 Built** `reverse_link` + `connectivity` | **accounting** reverse+CONN → customers → drivers → vendors → dispatch → safety. No 9227. |
| **Cursor** | Lead + leftover Built | Hourly INBOX; leftover URGENT-6 Built; FAST-MERGE this file to main |

ACK: `STANDARD=USMCA-LAUNCH | URGENT-6 | 4BOX-COMPLETE | HOURLY-REREAD | NOW=<FO> | GO`
