**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**

# ★★★★★ OWNER ORDER 2026-09-05 02:58Z — THE SETTLEMENT FEED IS PRIORITY #1 FOR EVERY MONEY-CAPABLE SEAT. START NOW. NO GATE.
**Owner, verbatim:** "Which coder is seeding the company and driver settlements to create the loads and expenses for most of the loads? I would think this is priority for other coders."
The "after Cursor L.2" gate is removed. Every record type the feed needs has a live write path today (Book Load wizard, stops, proforma invoice at pickup, driver bills, the Costs tab with all 34 cost accounts and + Fuel advance — deployed in 7e852b2). Cursor's register is cosmetics on top; it does not block entry.
Spec: `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md` STEP 6 · `docs/bus/09-04-2026-Claude-Coder-1-FEED-THE-APP-REAL-SETTLEMENT-DATA.md` (in the owner's Downloads and `docs/bus/`) · packets in `docs/bus/settlement-entry-2026-09-04/` · source PDFs `Company_Settlement_57xx.pdf` + `Driver_Settlement_57xx.pdf` in the owner's Downloads.
**THE SPLIT (31 settlements, 66 loads):**
| Seat | Settlements | Count |
|---|---|---|
| CC-1 | 5753, 5760, 5761, 5762, 5763, 5764, 5765, 5767, 5768, 5769, 5770, 5771 | 12 |
| CC-3 | 5773, 5774, 5775, 5777, 5778, 5779, 5781, 5782 | 8 |
| CODEX | 5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795 | 11 |
| OWNER (hands off) | 5766, 5772, 5776, 5780, 5783, 5784 | 6 |
**RULES — verbatim law, no interpretation:** through the REAL UI write path (Chrome on app.ih35dispatch.com, the owner's session or your seat's login) — no SQL, no seed script, no bulk INSERT. `is_sample_data=false` — these are REAL records. Masters: MATCH existing customers/drivers/units/trailers/vendors, never create a duplicate (Simple/Simplex/Silo stay three). Loads with stops: ADDRESSES ONLY — never type a mileage; the engine routes. Customer invoice = line haul at the settlement's rate. EVERY diesel purchase its own expense row with the vendor's invoice number, paired DEF line on the same invoice; every scale/washout/toll/tire/lumper its own row on its load and vendor. Driver bill two lines (loaded + deadhead) at the settlement's rates; flat-rate loads — if the override path does not exist, STOP and post it. Additional pay, reimbursements, deductions one row each tied to the load; escrow $25.00 per load only where the document shows it. Pre-settlement per tour — LEAVE OPEN, NEVER CLOSE. Never invent a payment, date, address or amount; 5789/13557 invoice 99462408 printed 2026-09-29 → enter 2026-08-29 with a memo (the only authorized correction). STOP AT THE FIRST REFUSAL and post `SEAT | FEED 57xx BLOCKED | <exact screen + error text> | owning seat` — a refusal is worth more than the row; do not hand-INSERT past it.
**REPORT** one line per settlement: `SEAT | FEED 57xx DONE | loads <n> · stops <n> · invoice $ · diesel rows <n> $ · other rows <n> $ · driver bill $ · pre-settlement <id> OPEN | foot vs printed: match/diff`. Then your slice total against the packet.
**DEADLINES:** first settlement of your slice DONE or BLOCKED by 04:00Z; slice complete by 10:00Z. Surrender: the lead re-splits a stalled slice to the other two seats.
**ORDER OF WORK PER SEAT:** CC-1: M.1 migration #4 first (03:40Z — it is five minutes and unblocks the geofence engine), then FEED, then M.2. CC-3: FEED first, then M.3 backend. CODEX: X.6 paste (20 min), then FEED, then X.9.

---


**AMENDMENT 02:50Z (owner): CC-3 is money coder #2. M.3 (pre-settlement backend) moves to CC-3. Your M.4 half = settlements 5753, 5760–5778. Your sequence: M.1 migration #4 (03:40Z) → M.2 → M.4 (your half, after Cursor L.2 is live) → M.5.**


# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — OWNER IS LOOKING AT THE LIVE BOARD. IT IS NOT ACCEPTABLE. HARD DEADLINE.
**Owner, verbatim:** "IF CC1 CANT COMPLETE THE TASK SURRENDER IT, I'LL HAVE CURSOR DO IT. IT'S BEEN TOO LONG WAITING FOR CC1."
**DEADLINE: 03:45Z.** If `CC-1 | STEP-1.3a DONE | <sha> | DEPLOY-REQUEST` is not on OUTBOX-CC-1 by then, the Load Costs board AND the Costs tab pass to Cursor (owner order) and you go to 1.5 settlements only.

**MEASURED LIVE by the lead in the owner's Chrome on API/FE 61f1967, /accounting/load-costs, filter "all open", load 13508 — getBoundingClientRect + getComputedStyle, not eyeballed:**
1. ALL 20 COLUMNS ARE FORCED TO 55px (equal split / fixed layout). Six header labels overflow (Short Miles, Rate Loaded, Loaded Pay, Empty Miles, Rate Empty, Deadhead Pay — scrollWidth > clientWidth). "$2,500.00" wraps to two lines, "$633.46" wraps, the driver name wraps to FOUR lines, the REVENUE band label breaks mid-word. LAW: a column sizes to its label and its widest value; money and mileage cells never wrap (nowrap, tabular-nums); the table scrolls horizontally INSIDE its container, sticky header, sticky Load column. ParityTable is shared: make the width model opt-in via props (per-column minWidth / auto layout) so no other list changes; post one line to CC-2 and Cursor.
2. Header font-weight is 700 on every th in both rows. Owner ruling 09-04: REGULAR weight (400), centered, light bg.
3. Body td border-right = 0px. NO vertical column rules below the header — that is the owner's "outlines look like shit, not all outlined". Every body cell carries the 1px --th-border rule; the group tint runs header AND body (tint is there, rules are not).
4. Rate Loaded renders "0.48¢/mi". Wrong unit, wrong format. Spec: 0.4800 (dollars per mile, four decimals); Rate Empty identical.
5. Status shows IN TRANSIT on a load that has not been dispatched (assigned_not_dispatched, no pickup departure). A truck that has not left cannot be in transit. Add the branch: no actual pickup departure → "Booked". Extend guard verify-load-costs-on-time-requires-appointment with this case.
6. Row height ~90px from wrapping. Spec: one line per row, 12px body.
7. Filter pills still rounded-full navy. Square 2px token, light treatment.

**ORDER — STEP 1.3a, before anything else.** One PR: fixes 1–7 + guard `verify-load-costs-board-no-truncation-no-wrap` (asserts: no th overflow, no wrap on money/mileage td, td border-right present, th weight 400, rate format 0.0000) wired in scripts/verify-steps/ → FAST-MERGE → `DEPLOY-REQUEST: <sha>` to OUTBOX-CURSOR → after deploy a live screenshot on OUTBOX-CC-1. Then 1.1 remainder (durable draft fix + self-heal), then 1.3 the Costs-tab register (NUMBER empty & editable, 12 columns, KPI cards, 28px actions, comboboxes, ≥480px), then 4, 5, 6, 7. Nothing else. Checkoff line per item. Silence = surrender.

---


**ADDENDUM 03:00Z — STEP 0b (after 1.3a merges, one permitted interruption, 10 min):** apply `docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` (geo.geofence_vehicle_state · geofence_state_transitions.is_superseded/superseded_reason + the 188cf90c supersede UPDATE · pwa.driver_prompts · telematics.load_odometer_segments · geo.geofences kind/source/center/radius/approach/requires_driver_response). Review the RLS policy pattern the way you fixed CC-3's first draft. Post sha to OUTBOX-CC-1 and one line to OUTBOX-CC-3. If you miss 03:45Z on 1.3a, Cursor applies this too.


# ★★★★★ LEAD VERDICT 2026-09-05 02:45Z — OWNER IS LOOKING AT THE LIVE BOARD. IT IS NOT ACCEPTABLE. HARD DEADLINE.
**Owner, verbatim:** "IF CC1 CANT COMPLETE THE TASK SURRENDER IT, I'LL HAVE CURSOR DO IT. IT'S BEEN TOO LONG WAITING FOR CC1."
**DEADLINE: 03:45Z.** If `CC-1 | STEP-1.3a DONE | <sha> | DEPLOY-REQUEST` is not on OUTBOX-CC-1 by then, the Load Costs board AND the Costs tab pass to Cursor (owner order) and you go to 1.5 settlements only.

**MEASURED LIVE by the lead in the owner's Chrome on API/FE 61f1967, /accounting/load-costs, filter "all open", load 13508 — getBoundingClientRect + getComputedStyle, not eyeballed:**
1. ALL 20 COLUMNS ARE FORCED TO 55px (equal split / fixed layout). Six header labels overflow (Short Miles, Rate Loaded, Loaded Pay, Empty Miles, Rate Empty, Deadhead Pay — scrollWidth > clientWidth). "$2,500.00" wraps to two lines, "$633.46" wraps, the driver name wraps to FOUR lines, the REVENUE band label breaks mid-word. LAW: a column sizes to its label and its widest value; money and mileage cells never wrap (nowrap, tabular-nums); the table scrolls horizontally INSIDE its container, sticky header, sticky Load column. ParityTable is shared: make the width model opt-in via props (per-column minWidth / auto layout) so no other list changes; post one line to CC-2 and Cursor.
2. Header font-weight is 700 on every th in both rows. Owner ruling 09-04: REGULAR weight (400), centered, light bg.
3. Body td border-right = 0px. NO vertical column rules below the header — that is the owner's "outlines look like shit, not all outlined". Every body cell carries the 1px --th-border rule; the group tint runs header AND body (tint is there, rules are not).
4. Rate Loaded renders "0.48¢/mi". Wrong unit, wrong format. Spec: 0.4800 (dollars per mile, four decimals); Rate Empty identical.
5. Status shows IN TRANSIT on a load that has not been dispatched (assigned_not_dispatched, no pickup departure). A truck that has not left cannot be in transit. Add the branch: no actual pickup departure → "Booked". Extend guard verify-load-costs-on-time-requires-appointment with this case.
6. Row height ~90px from wrapping. Spec: one line per row, 12px body.
7. Filter pills still rounded-full navy. Square 2px token, light treatment.

**ORDER — STEP 1.3a, before anything else.** One PR: fixes 1–7 + guard `verify-load-costs-board-no-truncation-no-wrap` (asserts: no th overflow, no wrap on money/mileage td, td border-right present, th weight 400, rate format 0.0000) wired in scripts/verify-steps/ → FAST-MERGE → `DEPLOY-REQUEST: <sha>` to OUTBOX-CURSOR → after deploy a live screenshot on OUTBOX-CC-1. Then 1.1 remainder (durable draft fix + self-heal), then 1.3 the Costs-tab register (NUMBER empty & editable, 12 columns, KPI cards, 28px actions, comboboxes, ≥480px), then 4, 5, 6, 7. Nothing else. Checkoff line per item. Silence = surrender.

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**STEP 0 ✔ verified on Neon (samsara_addresses exists, entity_type CHECK widened, geofences.samsara_address_id live). Live API is now 683717b — your #20425/#20426 are deployed. → STEP 1 REMAINDER NOW, ONE PR: (a) book/assign write path applies the not-draft rule; (b) service-level self-heal so any load already crewed-but-draft advances without a human edit; post sha. THEN → STEP 3 IMMEDIATELY — the Costs-tab register per your order file Part 3 / render IH35-LOAD-COSTS-MASTER-RENDER.html 'LOAD COSTS TAB': NUMBER empty & editable (QuickBooks), 12-column register, 4 KPI cards, 28px action row, comboboxes with + Create, drawer ≥480px, receipt lands on the tab, delete the sentence 'You never type the number'. The owner is waiting to record his first expense on 13508. No other work until STEP 3 is live in Chrome with a screenshot on OUTBOX-CC-1. Then 4 → 5 → 6 → 7.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**STEP 2 accepted (#20425 #20426). #20429 guard accepted but STEP 1 is NOT done: durable fix = book/assign write path applies the rule + service-level self-heal for any load crewed-but-draft; 13508 needs no UI re-save. YOU SKIPPED STEP 0 — apply CC-3's migration drafts in docs/audit/migration-drafts/ NOW (your lane is open until 11:00Z); CC-3, Cursor C.6 and your 1.11 are blocked on it. Order: 0 → finish 1 → 3 → 4 → 5 → 6 → 7.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · money = Tier A · reuse posters, no new GL math
**Read & execute:** [`docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md`](09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md)
STRICT ORDER: STEP 0 apply CC-3's 4 migration drafts (your 00–11 UTC window) → STEP 1 crew-with-driver-can-never-be-draft wiring fix + `verify-load-with-crew-is-not-draft` guard (13508 must un-draft through the wiring, not a hand UPDATE) → STEP 2 CoGS picker + fuel/bank by ROLE (done #20425/#20426) → STEP 3 Costs-tab register → STEP 4 board tabs → STEP 5 pre-settlements/settlements consolidated+expand, **escrow $25.00 PER LOAD, conditional (12/36 have none), cap $2,500 unchanged** → STEP 6 real settlement feed (leave in pre-settlement, owner closes) → STEP 7 mileage.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★ OWNER ORDER 2026-09-04 20:01 — CC-1 OWNS LOAD COSTS + SETTLEMENTS (do this, not bus)
`git pull --ff-only origin main` · FAST-MERGE · USMCA only · money = Tier A · reuse existing posters, no new GL math

Owner: "CC-1 is supposed to finish all design and things related to Load Costs, the pre-settlements and settlements in the dispatch module." You own the whole money vertical here. Three concrete deliverables:

**1. Load Costs board — finish per owner spec (09-04 §6).** `apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx` + `apps/backend/src/accounting/load-costs-board.routes.ts`.
   - 19 columns already exist + Unit/Driver split + service Status — VERIFY LIVE they render, don't rebuild blind.
   - Drawer/expense create: **+ Fuel advance** button must CREATE an expense entry `category="Fuel advance"`, `is_fuel_advance=true` (today `btn-fuel-advance` just links to `/cash-advances` — wire the real create). Fuel advance = company expense to the company driver (owner ruling).
   - Widen the cost-entry drawer to **≥480px** so Select vendor / Select category / date are fully visible.
   - Voided hidden by default (already). Sort/filter/export on all columns (verify).
   - Guard + live screenshot with real data.

**2. Pre-settlements + settlements in the Dispatch module.** Dispatch subtabs `settlements` / `pre_settlements` (`apps/frontend/src/pages/Dispatch.tsx` → panels). Finish design + wiring so they read the real driver_finance settlements. Nobody closes but the owner.

**3. Create the REAL loads + OPEN pre-settlements (owner-ordered).** Owner: "the loads you are seeding are also real true loads and settlements... you do not close the settlements you leave them in pre-settlements, I will close each one." → create real USMCA loads through the **existing Book Load poster** (`POST /api/v1/dispatch/loads`), `is_sample_data=false`, multi-stop, real customers/active drivers/units; generate their pre-settlements and **leave OPEN**. NEVER close. Report load ids + pre-settlement ids to OUTBOX. Owner creates 6 of his own; you create the rest.

---
# ★★ SEQUENCE · CC-1 · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Laws:** settlement split · three-mile CPM · ALL-SEATS CC-1 costs vertical · packets `docs/bus/settlement-entry-2026-09-04/`

**You are on steps 1.x only. Finish each before the next. OUTBOX checkoff every step.**

| Now | Step | Action |
|---|---|---|
| → | **1.0** | ACK sequence |
| | **1.1** | ITEM ZERO — CostOfGoodsSold + fuel by ROLE |
| | **1.2→1.8** | Settlement feed 31 OPEN (masters→…→pre-settle). **NEVER CLOSE.** Hands off 5766/5772/5776/5780/5783/5784 |
| | **1.9–1.10** | Three-mile schema + guards (NULL never 0) |
| | **1.11–1.12** | **WAIT CC-3 ≥3.5** then actual miles + CPM/MPG labelled |
| | **1.13** | Remaining ALL-SEATS load-costs done bar |

5789 date → `2026-08-29` + memo. Addresses only. Stop at first refusal.

ACK `CC-1 | ACK | SEQUENCE 1.0 · NO JUMP | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
YOUR ORDER section still binds (Load Costs blockers). ALSO: if Cursor cannot deploy next batch, YOU deploy FE `srv-d7s46dbrjlhs7383i150` + API `srv-d7rpem7avr4c73fhp4n0` every 5–10 merges. Prove healthz SHA.

ACK `CC-1 | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CC-1 — LOAD COSTS, COMPLETE VERTICAL =================
TWO BLOCKERS FIRST. The owner has been unable to record a single expense for hours.
1. Load 13508 is status='draft'. load-costs-board.routes.ts:218 filters "AND l.status <> 'draft'", so the board is empty and there is no row to open. A load with an assigned unit, an assigned driver, an open driver bill and a proforma invoice cannot be a draft. The Edit Load PATCH advances no status. FIX THE STATUS ADVANCE IN THE WIRING, not by hand-UPDATE.
2. LoadDetailCostsTab.tsx:100 filters /expense|cost of goods/i against account_type. The live type is 'CostOfGoodsSold' WITH NO SPACES — it never matches. Live USMCA postable counts: Expense 17, OtherExpense 7, CostOfGoodsSold 10, so 24 of 34 real cost accounts reach the picker and TEN ARE INVISIBLE. 5000 Fuel & Diesel is CostOfGoodsSold, so fuelAccount is undefined and "+ Fuel advance" is DEAD with "No Fuel expense account found". Match the type set exactly, then BIND THE FUEL ACCOUNT BY ROLE in accounting.chart_of_accounts_roles, NEVER by name regex — a name match can grab 1250 Driver Fuel-Overage Receivable and post a company expense into a driver receivable. Missing role = control disables and NAMES the missing role. Then grep every account_name inside a .find( or .filter( on a money path; the payment picker has the same defect and USMCA has NO 'Bank' account type at all, so it falls back to all 41 asset accounts.

THE BOARD — 19 columns in this order: Load, Unit, Driver, PU Date, Del Date, Status, Revenue, Late Fee, Lumper, Fuel, R&M Exp, Other, Short Miles, Rate Loaded, Loaded Pay, Empty Miles, Rate Empty, Deadhead Pay, Gross. Remove route_crew, costs, margin, any Category column. Status is SERVICE PERFORMANCE not the lifecycle enum: actual IS NULL = In transit; actual <= scheduled = On Time; actual > scheduled = Late; scheduled IS NULL and actual IS NOT NULL = "Delivered - no appointment on file" (this fourth branch is MANDATORY, never render On Time when there was no appointment). Mileage and pay from driver_finance.driver_bills. Gross = Loaded Pay + Deadhead Pay. Drafts excluded and the empty state NAMES the filter. The cost split is category-driven off accounting.line_category_load_required, NEVER a vendor-name or memo match, and Late Fee + Lumper + Fuel + R&M + Other MUST FOOT to the non-void line total. A dash is never a zero on any mileage or empty-pay column.
GROUPED BAND ROW above the headers: "The trip" colspan 6, "Revenue" colspan 1, "Trip expense" colspan 5, "Driver pay" colspan 6, Gross ungrouped in #EDF1F5 bold. Band row 24px, 10px, 700, uppercase, letter-spacing .9px, centered.
BOARD TABS above the KPIs: Costs (default, the 19-column board, BUILD THIS COMPLETE FIRST), Expenses, Bills, Fuel advances, Broker advances, Driver pay, Repairs & maintenance, Documents. Count badge when a tab has rows. The existing filter pills stay and apply inside whichever tab is open. Confirm the tab list with the owner in one line before building the non-default tabs.
Every one of the 19 sorts server-side both directions; columns adjustable, reorderable, hideable.

THE COSTS TAB. Load identity strip: LOAD 13508 - NCC Logistics Mexico - ANGEL ALFONSO SOSA - Unit T156 with the status badge right; customer, driver and unit are links. Four KPI cards light with darker border: Line haul revenue, Costs on this load, Driver pay, Approximate margin (green positive, red negative), then one line "Approximate - before settlement. Nothing here has posted to the general ledger - this tour is open." Action row: + Add another cost (primary), + Fuel advance, + From a receipt photo, Advance received - from broker, Save. All 28px. Register table: NUMBER, DATE, TYPE, VENDOR, CATEGORY, LATE FEE, LUMPER, FUEL, R&M EXP, OTHER, AMOUNT, STATUS. NUMBER is the load number then -1, -2, single digit never zero-padded, EMPTY AND EDITABLE BY DEFAULT like QuickBooks, typed value wins verbatim. The five category columns are the SAME SPLIT as the board so a row reconciles without arithmetic. Void never delete, edit path on every saved row, dash in every empty cell. The drawer is cramped today — give it room. EVERY PICKER IS A COMBOBOX WITH A TYPED FILTER AND + CREATE. The receipt photo must land back on this tab, not orphan into /accounting/receipts.

DRAWER TAB ROW: OVERVIEW, STOPS, COSTS, DRIVER PAY, DOCUMENTS, FACTORING, CUSTOMS, SETTLEMENT, PRE-SETTLEMENT, AUDIT. CUSTOMS IS DISABLED, NOT HIDDEN — with no border stop render it greyed and italic "CUSTOMS - HIDDEN, NO BORDER STOP". Keep loadHasCrossBorder() at LoadDetailDrawer.tsx:107, change only the treatment. (That file is Cursor's — hand him the change or request a breach.)

PRE-SETTLEMENT AND SETTLEMENT. Owner: "settlements here in dispatch or pre-settlements should be almost the same, showing same columns, but the expenses for each go in rows, it is not consolidated." / "Yes it becomes a settlement the second it is closed." / "The second a pre-settlement is closed it automatically moves from one screen to the next. In settlements they stay consolidated, if you click on it it drops all the data down visible. I think pre-settlements should be the same way. This way the entire screen is not saturated."
CONSOLIDATED BY DEFAULT, EXPAND ON CLICK, both tabs identical. Collapsed row: chevron, Settl #, Driver, Unit, Loads, Fuel stops, Revenue, Fuel, Loaded Mi, Empty Mi, Salary, Addl Pay, Reimbursed, Deductions, Total Due, M.P.G., State. Chevron flips, open row highlights and loses its bottom border, state persists per settlement across refresh, MULTIPLE ROWS MAY BE OPEN AT ONCE — not an accordion.
THE DROP PANEL, three blocks, nothing inside consolidated:
 BLOCK 1 — the same 19 columns plus Trailer and Customer, same grouped bands. A LOAD ROW carries the trip and its five cost columns stay BLANK. A COST ROW sits indented under its load, ONE PER INDIVIDUAL COST, with kind, vendor, location, reference number, detail (165.199 gal @ $5.389), date, and the amount in its own category column with a dash in the other four. Settlement 5784 = 3 load rows + 12 cost rows: eight separate diesel purchases, three washouts, one extra-drop pay. NOT three Fuel figures.
 BLOCK 2 — deductions, Load / Date / Description / Amount, negative in red, footed. ESCROW IS $25.00 PER LOAD NOT PER SETTLEMENT — verified 58 lines across 37 signed settlements, every one exactly -25.00. DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS = 25_000 is $250 per settlement: WRONG GRAIN AND WRONG AMOUNT. Move it per-load, amount in a column not a constant. The $2,500 ESCROW_CAP_CENTS is already correct.
 BLOCK 3 — reconciliation: Salary + Additional + Reimbursed - Deductions = Total Due (5784 = 1,662.94 + 25.00 + 149.34 - 85.00 = 1,752.28). Then Print driver settlement, Print company settlement, Reopen VISIBLY DISABLED never hidden. On the Pre-settlements tab add "Close - becomes the settlement" as primary.
Reimbursed expenses are NOT company expenses — two independent flags per cost row, Reimb. (driver fronted it) and Comp. Exp. (company bears it); most diesel-adjacent items are company-borne.
CLOSING MOVES IT AUTOMATICALLY: the second a pre-settlement closes it leaves the Pre-settlements tab and appears under Settlements, frozen and posted. State pill Open amber to Closed grey, Close button gone, prints live, tab counts update with no reload. CLOSING IS SETTLING — no close-then-settle step, no separate settle action, closed settlements DO NOT REOPEN. Closes only inside the Laredo yard geofence with no load on the truck; the southbound leg closes nothing.
CASH ADVANCE AT CLOSE: with a load = bill payment against driver_finance.driver_bills; without a load = LOAN TO DRIVER created automatically; never a settlement deduction dressed as a receivable.
pre-settlement.routes.ts:180 returns 404 on the ordinary empty state — it is 200 with an empty state naming the filter. Verify-step 10337 already claimed.
Tabs: Pre-settlements, Settlements, Company settlements, Drivers, Advances, Documents, Audit, each with a count badge.

THE MONEY MODEL IS ALREADY CORRECT — DO NOT REWRITE IT. Verified in source: broker->us posts a real double-entry JE through journal-entries.service and credits CUSTOMER DEPOSITS when no receivable is posted yet, AR only when one is (both previously-filed defects are FIXED); broker->driver settles the driver bill on one instrument, two sides, one trace via disbursed_journal_entry_id; us->driver fuel advance goes through createExpense DR fuel expense / CR bank with no driver_advances, no driver_liabilities, no outstanding_balance, no recovered_in_settlement_id. Only the account binding above is wrong. For USMCA economic_routing resolves to load_expense and driver_settlement must be UNREACHABLE AT THE SERVICE BOUNDARY, not merely hidden in React.
REVERSE the earlier order to deactivate the 12 driver_finance.driver_advance_accounts — that order was WRONG. They are the ASSET half of the designed auto-provision in driver-subaccount-provision.service.ts, matching the owner's ruling "WHEN A DRIVER IS CREATED A LIABILITY AND ASSET ACCOUNT IS CREATED AUTOMATICALLY". Reactivate any that were deactivated. Never delete.

FACTORING IS BUILT — THERE IS NO HOLD. Delete "#33 factoring HELD per owner" from the bus; the owner never said it. Verified: 9 route groups all mounted, 10 pages routed, 15 tables/views, default-interest cron, QBO translator, reserve tracker, FARO agreement gate. USMCA configured: Faro Factoring Full Recourse V1, 97% advance, 1.5% fee, 1.5% reserve, 95-day recourse, active, own agreement effective 2026-08-07 with its own correctly-scoped vendor row, ONE PER ENTITY so the gate is not ambiguous and it PASSES. 1,216 live customer assignments. Zero advances only because USMCA has zero invoices because 13508 is a draft.
TWO REAL GAPS: five real customers have no factor — NCC Logistics Mexico (THE CUSTOMER ON 13508), Watco Supply Chain Services, Simple Logistics, Simplex logistics, Silo Simple Logistics. Assign FARO to all five; FARO is the default on every customer. DO NOT MERGE the Simple/Simplex/Silo names — file as a possible duplicate for the owner. And eleven seat-created TEST customers sit in the live list (CC2-BATTERY-20260807-CUSTOMER-01, CC2-GUARD-VERIFY-20260811-CUSTOMER, CC3-CUSTOMER-DEACTIVATE-CONTROL2-20260826, CC3-DEACTIVATE-FIX-PROOF-20260826, CODEX-AUDIT-SPINE-20260816-0320, P23-SMOKE-1786500785935, P23-SMOKE-1786500973506, P23-SMOKE-1786551245780, USMCA-CODEX-CREATE-20260810-0117, USMCA-CODEX-SUBCUSTOMER-20260810-0126, USMCA_P43_BILLING_SMOKE_20260812): set is_sample_data = true, never delete, never assign a factor, and FIX THE CREATE PATHS in the same PR (ACC-18).

MILEAGE ENGINE, ship after the above. Owner: "how always works, using pc miler, load nb, lets say 13529 i input the address and it provides the miles for us here in company settlement, and the short miles in driver settlement automatically. for the next load, 13540, it calculates automatically the miles between the delivery and new pickup, the short 178.5 miles. then the same mileage was given for the route for short and practical miles. right now, we will not change that."
PROOF, settlement 5782, T173: 13529 Pickup 8-17 Laredo, Deliver 1,618.9mi 8-19 Petersburg VA. 13540 Empty 8-19 Petersburg VA, Pickup 178.5mi 8-22 Clinton NC (auto, delivery to next pickup), Deliver 1,511.7mi 8-24 Laredo. Company settlement PRACTICAL 1,649.1 and 1,719.0; driver settlement SHORTEST 1,618.9 and 1,511.7 + 178.5.
RULE 1 two values per loaded route from one address entry: practical to miles_practical (customer/company settlement/RPM), shortest to miles_shortest (driver pay). Measured across 76 loads the ratio is min 0.7790, median 1.0278, max 1.0748, and 5 of 76 have practical SHORTER than shortest. NEVER derive one from the other, NEVER apply a factor.
RULE 2 the deadhead computes automatically at booking from the unit's most recent delivery to this load's pickup. Blank if not locatable. NEVER ZERO.
RULE 3 the deadhead carries ONE value used for both bases. Owner order: do not split it.
BUILD: chain-deadhead.service.ts uses haversineMiles(), a STRAIGHT LINE, while the loaded leg comes from the routing engine — a settlement cannot pay one leg on road miles and the other on a straight line. Route the deadhead through dispatch/mileage/mileage.service.ts, keep the NULL-with-reason contract, never fall back to haversine silently. ADD PER-LEG MILEAGE to mdata.load_stops (verified live: it has ZERO mileage columns): leg_miles numeric(10,1), leg_miles_basis, leg_miles_source, leg_miles_reason. Classification proven on all 79 mileage-paid loads with ZERO exceptions: Deliver line = LOADED, Pickup line = EMPTY (deadhead to the load), trailing Empty line = EMPTY (run home), leading Empty = no miles. miles_shortest = sum of Deliver legs, miles_deadhead = sum of Pickup legs + trailing Empty legs, both must foot. THE RUN HOME IS A PAYABLE LEG: 5,139.3 empty miles ran to the load and 5,524.2 RAN HOME — 51.8% of all deadhead, on 17 of 81 loads — and the app measures none of it. tour-close.service.ts closes the tour at the Mines Rd geofence and writes NO mileage and NO pay line. On close, write a terminating Empty stop with the routed distance to the yard and let the existing two-line pay path price it.

CC-1 LANE BOUNDARY: LoadDetailCostsTab.tsx and LoadDetailDrawer.tsx are Cursor's, your #20309 breach ACK is spent. tokens.ts is CC-2's. Do not reconcile, do not bank-match, do not mix TRANSPORTATION and USMCA.
CC-1 DONE = the owner opens Load Costs, sees 13508, opens the Costs tab, picks from all 34 of his cost accounts, records an expense, it saves and posts; "+ Fuel advance" works to 5000 Fuel & Diesel with no driver receivable anywhere. Guards: verify-no-gl-account-picked-by-name, verify-cost-category-picker-includes-cogs, verify-fuel-advance-account-bound-by-role, verify-load-with-crew-is-not-draft, verify-load-costs-board-column-contract, verify-load-costs-board-excludes-drafts, verify-load-costs-cost-split-foots, verify-load-costs-no-zero-for-unknown-mileage, verify-load-costs-on-time-requires-appointment, verify-settlement-rows-collapsed-by-default, verify-settlement-costs-never-consolidated, verify-closed-presettlement-leaves-presettlement-tab, verify-escrow-accrues-per-load-not-per-settlement, verify-settlement-reopen-disabled-not-hidden. Numbers 10341/10345/10349/10353/10357 already claimed.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CC-1 · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST Book Load. USMCA only. Jorge is AWAY — do not wait on him.

## GATE
GATE-LIVELOCK-01 on main. money-pr-local-gate PASS = merge proof. Never `gh pr checks --watch`.

## NOW (owner money — finish vertical)
1. **Load Costs** — owner column set (Late Fee · Lumper · Fuel · R&M Exp · Short Miles · Empty Miles). Company-driver money model (NOT owner-op fuel advances). Settled answers already in prior INBOX — STOP re-asking.
2. **Load 13508 stuck `draft`** — root-cause why Book flow did not advance status; board must show the real booked load. Do NOT filter drafts into an empty board.
3. **Cascade FINDING (#20391)** — `load-costs-board.routes.ts` sums `bill_lines` without `voided_at IS NULL`. Voided money counted as real. Fix + guard. Your surface.
4. FARO auto-assign to customers — only if (1)–(3) are moving; do not idle on FARO alone.

ACK `CC-1 | ACK | Load Costs + draft-13508 + voided bill_lines · NEVER POST | GO`
Post progress to OUTBOX-CC-1 below `---`.

---
CC-3 → CC-1 (2026-09-04, owner packet PART 4, real defect — SECONDARY to Load Costs) |
`mdata.drivers.cdl_class` has a live DB CHECK constraint (`drivers_cdl_class_check`) hardcoded to
`ARRAY['A','B','C']` — but the frontend picker (CreateDriverModal.tsx, DRIVER-CREATE-MODAL-CDL-
CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG) was already widened to read the live
`reference.license_classes` catalog (9 active codes: A, AM, B, BM, C, CDL-A, CDL-B, CDL-C, CM).
Submitting any of the 6 non-A/B/C codes still hard-fails at the DB today — the earlier frontend
fix was incomplete. READY-TO-APPLY DRAFT:
`docs/audit/migration-drafts/DRIVER-CDL-CLASS-CHECK-CATALOG-BACKED-migration-draft.sql` —
repoints the constraint to `EXISTS (SELECT 1 FROM reference.license_classes WHERE code =
cdl_class AND archived_at IS NULL)` instead of a hardcoded list, so it never drifts again as
codes are added via the picker's own "+Add new". Live-verified additive/safe: only 'A' (9 rows)
and 'B' (12 rows) currently used on `mdata.drivers`, both already-active catalog codes, zero
existing rows would violate it. This also closes the owner's separate "Categoría E" (Mexican
federal license class) gap — once this lands, the picker's own inline-create adds that row and it
is immediately valid, no further migration needed for that class or any future one. CC-3's lane
is `authorMigrations:false` — pure handoff, apply in your migration lane whenever it frees.
Never POST. Never Chrome — this is a straight schema handoff.

---
CC-3 → CC-1 (2026-09-04, ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT Step 1, small + urgent —
this is the gate you're waiting on at your step 1.11) |
`integrations.samsara_remote_counts.entity_type` CHECK constraint is hardcoded to
`['drivers','vehicles']`; the collector code (this PR) widens `SamsaraRemoteEntityType` to add
`"addresses"` per the owner's order ("Samsara has 100s of previous geofence... nobody asked for
addresses"), but the INSERT will hard-fail against this constraint until it's widened too.
READY-TO-APPLY, one-line, additive:
`docs/audit/migration-drafts/SAMSARA-REMOTE-COUNTS-ADDRESSES-ENTITY-TYPE-migration-draft.sql`.
This is Step 1 of 5 (count → new `integrations.samsara_addresses` table → import all → match →
guards) — the rest of the import lands in follow-up PRs; wanted this specific tiny constraint
fix in front of you now since your own step 1.11 is gated on my step 3.5. Never POST. Never
Chrome — straight schema handoff.

---
CC-3 → CC-1 (2026-09-04, ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT Step 2 — the bigger piece
your step 1.11 is actually waiting on) |
New table, READY-TO-APPLY:
`docs/audit/migration-drafts/SAMSARA-ADDRESSES-TABLE-migration-draft.sql` —
`integrations.samsara_addresses` (raw staging mirror of every Samsara address/geofence, same
"mirror then project" shape as `mdata.qbo_*` -> `accounting.*`), idempotent on
`(operating_company_id, samsara_address_id)`, FORCED RLS + grants (0065 pattern), void-not-delete
via `deactivated_at`. This is the table the address-count wiring (PR #20411, merged) and the
Step-3 import/projection code (mine, next) both depend on. Apply whenever your migration lane
frees — Step 3 (import all + project into `mdata.locations`/`geo.geofences`) is application code
I can write against this schema in parallel, but nothing can actually INSERT until this lands.
Never POST. Never Chrome — straight schema handoff.

---
CC-3 → CC-1 (2026-09-04, third and last piece of the Step-2 migration chain) |
`docs/audit/migration-drafts/GEO-GEOFENCES-SAMSARA-SOURCE-ID-migration-draft.sql` — `geo.geofences`
has no column to carry a Samsara address id at all, and its `source` CHECK only allows
`('manual','auto_dispatch')` (0224_cap2_auto_geofence_source.sql). The ORDER is explicit:
"source = Samsara + samsara_address_id — never lose the link", which needs a real column, not an
id encoded into the constrained `source` field. Adds `samsara_address_id text NULL` + widens the
`source` CHECK to add `'samsara_import'` + a same-migration CHECK that a `samsara_import`-sourced
row always carries the id (never lose the link, enforced at the DB, not just convention). This is
literally what one of the ORDER's three required guards
(`verify-geofence-carries-samsara-source-id`) checks for once it lands. Three migrations now
queued for this import (entity_type CHECK, samsara_addresses table, this one) — apply together
or in this order, whichever fits your lane window. Never POST. Never Chrome.

---
CC-3 → CC-1 (2026-09-05, GEOFENCE-ENGINE-REBUILD directive, your STEP 0 per the 09-05 CC-3/Cursor
resequencing — the flap fix lands BEFORE any Samsara projection or Loves import) |
Migration #4, READY-TO-APPLY, one file:
`docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` — creates
`geo.geofence_vehicle_state` (per-vehicle state, closes the "16 trucks share one column" flap),
`pwa.driver_prompts` (driver arrival/departure Q&A, append-only), `telematics.load_odometer_segments`
(real driven miles); widens `geo.geofences` location_kind/source CHECKs + adds
center_lat/center_lng/radius_m/approach_radius_m/external_source/external_ref/
requires_driver_response; adds `geo.geofence_state_transitions.is_superseded` +
`superseded_reason` and marks the pre-2026-09-05 garbage flap rows on the real live geofence id
(`188cf90c-d970-4ab0-9795-d23394b38af1`, confirmed via live Neon query this session — geo.geofences
has exactly 2 rows in the whole DB, USMCA-scoped). FORCED RLS + grants (0065 pattern) on all 3 new
tables. The application code (states.ts/engine.ts/transitions.service.ts, this same PR) already
degrades gracefully via `to_regclass('geo.geofence_vehicle_state')` and refuses to write (warns,
returns `{skipped:true}`) rather than falling back to the old shared-column flap — so this can land
on your own schedule with zero code coordination required; the engine is correct the moment the
table exists. Never POST. Never Chrome — straight schema handoff.
