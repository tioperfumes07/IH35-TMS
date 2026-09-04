# ★★ OWNER ORDER 2026-09-04 — FEED REAL SETTLEMENT DATA (YOUR 31 · OPEN PRE-SETTLE)
`git pull --ff-only origin main`

**Full law (supersedes all earlier settlement-entry lines):** `docs/bus/ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md`  
**Packets:** `docs/bus/settlement-entry-2026-09-04/` (feed md + split md + TIE-OUT + ENGINE-vs-PCMILER)

**YOU CREATE 31 / 66 through the real UI.** Entity **USMCA**. `is_sample_data=false`.  
**CREATE:** `5753, 5760–5765, 5767–5771, 5773–5775, 5777–5779, 5781–5782, 5785–5795`  
**DO NOT TOUCH:** `5766, 5772, 5776, 5780, 5783, 5784`

**Owner rulings that bind:**
1. **NEVER CLOSE.** Create open **pre-settlements** only. Owner closes one by one. Report must show **31 OPEN · 0 closed · 0 close JEs**.
2. **All 81 loads COMPLETE** (settlements-only download — no live loads in this set).
3. **Addresses only** for miles — engine routes; paste into ENGINE workbook yellow columns.
4. **5789** / load **13557** / LOVES invoice **99462408** (146.879 gal @ $5.719 = $840.00) at 10465LONESOME PINE TRAIL M,TN, TN: printed `2026-09-29` → load as **`2026-08-29`** + visible memo.

**ITEM ZERO (blocks diesel):** fix `LoadDetailCostsTab` `CostOfGoodsSold` type match + bind fuel account by ROLE before any expense row.  
**ITEM ZERO-B (before owner closes):** widen tour-close to **Laredo delivery OR yard geofence**; preserve type-A paid deadhead vs type-B none; guard `verify-tour-closes-on-laredo-delivery-or-yard`.

Creation order: masters → loads/stops → customer invoices → expenses/bills (diesel+DEF paired) → driver bills → add-pay/reimburse/deduct → **pre-settlement STOP**. Payments only if document shows one.

File telematics defects for CC-3 (do not fix): duplicate `vehicle_latest_position`, null city/state today, T144 silent since 2025-07-09.

ACK `CC-1 | ACK | FEED-REAL-DATA 31 OPEN PRE-SETTLE · NEVER CLOSE · NEVER TOUCH 6 | GO`

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
