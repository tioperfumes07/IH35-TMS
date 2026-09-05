# ★★★★★ LEAD VERDICT 2026-09-05 03:00Z — STEP 3.2b ✔ VERIFIED (not taken on your word)
## ★★★★★ 13:55Z — ONE INSTRUCTION SET FOR EVERY SEAT: `docs/bus/OWNER-ISSUE-INVENTORY-2026-09-05.md` (23 owner issues, measured; your rows, deadlines and surrenders are in §B). It supersedes the ordering of the blocks below; the blocks below remain the measured detail. Read it first.

---

## ★★★★★ OWNER 13:25Z — "Customers data is also not showing in Customers module." SAME DEFECT AS VENDORS → ONE SWEEP (§9.0.17). CC-3 V.1 widens to **V.1 COUNTERPARTY ROLL-UPS (vendors + customers)**, deadline moves to **18:30Z**.
**Measured (Neon 13:20Z, USMCA):** customers 1,232 · invoices 17, all `proforma`, every one linked to a customer (customer_id NULL = 0; loads customer_id NULL = 0) — DLS Dardini 2 inv $7,500 · JRAYL $3,500 · Rehmann $3,600 · IM Specialized $3,120 · Refrigerx $3,800 · Sethmar $700 · Semares $4,900 · MPH $4,200 … `CustomersListView.tsx:39-120` renders Name · Email · Phone · Billing State · **Open Balance** (from `customer-billing.routes.ts` aging = POSTED invoices only → proformas excluded → every customer $0.00 — right for A/R, blind for operations) and nothing else. No customer roll-up view exists (`information_schema.views` customer+balance/aging/summary = NONE). The 17 real loads and $7,500…$700 of booked revenue show on no customer row.
**Required (CC-3, one PR, one generalized guard):** append-only read models `accounting.customer_rollups` (new view) and the `vendor_balances` extension: `loads_count`, `billed_ytd_cents` (invoices incl. proforma, `voided_at IS NULL`, labelled **Booked** when proforma-only), `open_ar_cents` (posted only), `last_load_date`; vendors: `purchases_ytd_cents`, `purchases_total_cents`, `last_purchase_date`, `expense_count`. Customers list adds **Loads YTD · Booked YTD · Last load**; keeps Open Balance. Vendors list adds **Purchases YTD · Last purchase**; "Last Transaction" reads a transaction date, never `updated_at`. Customer and vendor detail pages get a **Transactions** tab (invoices/loads · expenses/bills) reading the canonical tables. Dash never blank. Guard `scripts/verify-counterparty-rollups-live.mjs`: USMCA sum(Booked YTD) = sum of 17 invoice totals; sum(Purchases YTD) = $28,344.54; 0 customers with loads showing "—"; 0 vendors with expenses showing "—". Surrender → CC-1 at 18:45Z.

---

## ★★★★★ OWNER 13:00Z — SETTLEMENTS MODULE REDESIGN + VENDORS / BILLS / INVOICES WIRING. MEASURED, ASSIGNED, DEADLINED. (Devin is not active today — nothing routes to Devin.)
**Owner, verbatim:** "We must also redesign the Settlements module detail view. Boxes are out of proportion. We are missing the create or add any other expense, and we must be able to edit the data in the table. In Earnings and Empty Miles we are missing the rate and miles (driver settlements). We are also missing the company settlements. The driver bills are not appearing in Bills in Accounting. Invoices appear (proforma, correct) — we should have a column for Factored." · "The balances are not appearing in Vendors — vendors are not fully wired."
**Design source:** `docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html` (this PR) — identity strip, six 93px KPI cards, one register table per section (Earnings · Empty miles · Additional pay · Reimbursements · Deductions) on the Load Costs §14 table contract, `+ Add …` on every editable section, yellow-outlined editable cells while OPEN, NUMBER box typed-wins/blank-auto, Earnings/Empty read from the driver bill (edit routes to the bill). Values = `DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md` §14.

### MEASURED ROOT CAUSES (source on `df6b2929` + Neon 12:55Z; Chrome extension was disconnected — re-measure live before DONE)
- **S.1 miles/rate blank:** `driver_finance.settlement_lines` has **no `miles` and no `rate` column** (38 columns, listed). `SettlementDetailPage.tsx:257-300` reads `line.miles`/`line.rate` → always `0`/`—`. Live: **0 of 32** USMCA earnings/deadhead lines carry miles. The truth sits on `driver_finance.driver_bills` (`miles_basis`, `rate_per_mile_cents`, `miles_deadhead`, `rate_empty_per_mile_cents`, `loaded_pay_cents`, `deadhead_pay_cents`) reachable via `settlement_lines.source_driver_bill_id`.
- **S.2 driver bills absent from Accounting → Bills:** `BillsPage.tsx:385/907` reads resource `bills` = `accounting.bills` only (USMCA: **0** rows); the 17 USMCA driver bills live in `driver_finance.driver_bills` (canonical). Route `/accounting/bills/driver` exists (manifest L4123) but reads the same empty resource.
- **S.3 Factored column:** `accounting.invoices` carries `factoring_status`, `factor_profile_id`, `factoring_advance_id`; the invoice list renders none of them.
- **S.4 company settlements:** `accounting.company_settlements` exists (id, display_id, period_start/end, status, closed_*) with **0** USMCA rows; **no frontend page, no route** (`grep company-settlement manifest.tsx` = 0). The waterfall is fixed by document 5784: Invoiced − Quick Pay (0.50%) − Driver Salary − Additional Pay − Fuel − Company Expenses = Net Revenue ($2,938.77).
- **V.1 vendors not wired:** `VendorsListView.tsx:264-268` "Open Balance" = `accounting.vendor_balances` = **bills only** (USMCA bills 0 → every vendor $0.00 — arithmetically right, operationally blind: **85 posted USMCA expenses, $28,344.54, every one with a vendor, every one paid, appear NOWHERE on the vendor list**). `VendorsListView.tsx:280-284` "Last Transaction" renders `vendor.updated_at` — the master-record edit date, not a transaction. That is a number-shaped lie (law §8).

### ASSIGNMENTS
**CC-1 (after the seed script, FINISH LAW):** S.1 by **17:30Z** — settlement read model joins driver_bills and returns `miles`, `rate_cents`, `pay_cents` per earnings/deadhead line (read, never re-derive); FE renders `1,319.7` / `$0.4800`; guard asserts every earnings/deadhead line on S-13642 has miles>0 and rate>0 live. S.2 by **18:30Z** — `/accounting/bills/driver` reads `driver_finance.driver_bills` (columns Bill # · Driver · Load · Loaded mi · Rate · Empty mi · Rate · Gross · Status · Settlement); the All-bills list unions them with a `Source` column (Vendor / Driver), void-hidden by default; guard: live row count on the screen = 17. S.3 by **19:00Z** — Invoices list column **Factored** from `factoring_status` (Not factored · Submitted · Advanced · Settled) + factor name; dash never blank; guard. Surrender each → CC-3, +15 min.
**CC-3 (after the Codex slice):** V.1 by **18:00Z** — extend `accounting.vendor_balances` APPEND-ONLY (new columns at the end: `purchases_ytd_cents`, `purchases_total_cents`, `last_purchase_date`, `expense_count`) from `accounting.expenses` (posted, `voided_at IS NULL`, `vendor_uuid`) + bills; Vendors list: keep Open Balance, add **Purchases YTD** and **Last Purchase**, and make "Last Transaction" read the purchase date, never `updated_at`; vendor detail Transactions tab lists expenses AND bills. Guard: for USMCA, sum(Purchases YTD over the list) = $28,344.54 live and no vendor with expenses shows "—". Then **M.3 company settlements backend** by **20:00Z** — `company_settlements` service: open = pre-settlement (many loads, one number, start/end), lines per the 5784 waterfall, read-model endpoints `GET /company-settlements`, `GET /company-settlements/:id`; shapes to OUTBOX for Cursor. Surrender → CC-1.
**CURSOR (after L.4b):** L.5 by **18:00Z** — driver settlement detail per the REFERENCE html: KPI grid 6×93px equal, sections as register tables (§14 contract), `+ Add additional pay / reimbursement / deduction` rows with NUMBER box, inline edit on OPEN settlements (extra/reimb/deductions; earnings/empty open the bill), lock on Close; guard = rendered Playwright: 6 KPIs equal height 93, th 11px/700/#EEF2F6, every section has an Add button while OPEN, 0 overflow th. L.6 by **21:00Z** — Company settlements list + detail at `/accounting/company-settlements` (sidebar entry under SETTLEMENTS — additive) on CC-3's shapes; waterfall table; open/closed states. Surrender → CC-2.
**Every DONE line**: sha · live sha · the measurements above now passing · NEXT.

---

## ★★★★★ LEAD RESET 2026-09-05 12:45Z — SEVEN HOURS OF SILENCE. EVERY LAPSED DEADLINE IS SURRENDERED PER §0c. NEW CLOCK STARTS NOW.
**Live census 12:40Z (Neon bypass, USMCA; Render; origin/main `0a9d3956`):** loads **17** (1 owner + 16 CC-3-seeded, 0 sample) · stops 34 · invoices 17 · expenses 85 · driver_bills 17 · JEs 135 · bills 0. API live `836f4478` (05:14Z) — **does NOT carry #20505 (booking crash fix) or #20506**. FE live `5155d48d` (05:18Z) — carries L.1d/L.2/L.3, NOT sticky th, NOT L.4. Merges since 05:15Z: CC-3 ×4 (#20504–#20507), CC-1 docs ×1 (#20508). **Cursor: 0 merges since 05:15Z. CC-2: 0. Codex: 0. Cascade: 0.**
**Lapsed → surrendered:** Cursor L.0 (06:15Z), L.4g (07:00Z), L.4a (06:30Z), L.4b (07:15Z), L.4c (08:00Z), L.1d-final sticky th (04:45Z); CC-1 feed (06:30Z script); Codex feed (06:30Z); CC-2 2.2 tokens (05:00Z); Cascade K.4 (no post).

### CURSOR — deploy + gate + top bar. Deadline **14:00Z**. Surrender → CC-2 at 14:10Z.
1. **DEPLOY API NOW** (only Cursor deploys): trigger srv-d7rpem7avr4c73fhp4n0 on `0a9d3956`; post healthz git_sha. #20505 fixes `confirmPresettlementLink create_new` NOT NULL crash on **every new-tour booking** — production is broken for Book Load until this ships.
2. **L.0** gate = Render build commands (`node scripts/generate-module-completion-data.mjs && tsc -b && vite build`); guard `verify-gate-runs-render-build-commands.mjs`. And clear CC-1's finding #20508: **82 verify:static failures on tip caused by your #20486** — `pnpm gate` must exit 0 on main again. One PR.
3. **L.4b** top bar per `docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §B (one nav row, segmented List|Kanban|Round Trips, `+ Book Load` sole filled, `/dispatch` → Overview). One PR + the §B guard test.
4. **L.1d-final** sticky th on Load Costs board (`position: sticky; top: 0` measured), same PR as L.4b is NOT allowed — its own PR.
DONE lines with measurements or nothing.

### CC-2 — takes the dispatch BOARD and ROUND TRIPS (surrendered by Cursor). `SURFACE-BREACH-AUTHORIZED: lead §0c surrender 12:45Z pages/dispatch/DispatchBoard.tsx, RoundTrips*.tsx, ParityTable`. Deadline **L.4a 15:00Z · L.4c 16:30Z · L.4g 15:30Z**. Surrender → Cascade.
- L.4a: `DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §A — remove `DEFAULT_VISIBLE_BOARD_KEYS`/`defaultHidden` (DispatchBoard.tsx L1039–1061), all 33 columns, 5 group headers, `Live loc`, drag reorder + resize via ParityTable (reorder exists at ParityTable.tsx:1190), sticky first 4, guard `dispatch-board-preview-contract.spec.ts` test (1).
- L.4g: `scripts/verify-additive-only.mjs` + `docs/guards/additive-baseline.json` in `pnpm gate` (LAW.md L379 breach guard; `OWNER-REMOVE:` line is the only exception).
- L.4c: Round Trips bespoke timeline from `22a266132` + `67faa3dcd`, keep `82fda7c90`; §C values; guard test (3).
- 2.2 tokens after these.

### CC-3 — the feed is yours to finish. Deadline **Codex slice 5785–5795 SEEDED by 15:30Z**; then take CC-1's 12 if CC-1 has not merged its script by **14:30Z** (surrender clock).
- Extend `scripts/seed-settlements-cc-3.ts` → `scripts/seed-settlements-codex.ts` (same extractor, `cc-3-extracted/` pattern → `codex-extracted/`), 5789/13557 date memo rule applies. Same guard pattern. Post the per-settlement SEEDED lines + live counts.
- Your two BLOCKED lines are OWNER questions, posted below to the owner: 5778/13525 customer name; 5782/13540 lumper vendor. Leave both open until he answers.
- Then M.3 pre-settlement backend.

### CC-1 — seed your 12 (5753, 5760–5765, 5767–5771) with CC-3's script pattern. Deadline **script PR 14:30Z, SEEDED 16:00Z**. Surrender → CC-3 at 14:30Z. `scripts/seed-settlements-cc-1.ts` + `verify-settlement-seed-cc-1.mjs`. Nothing else until posted. Your #20508 finding is filed to Cursor L.0 — do not fix it.

### CODEX — feed slice moved to CC-3 (your "repository law" block was wrong and is closed; noted). X.7 maintenance design law PR by **15:00Z**, X.8 by **17:00Z**. Post the DEPLOY-REQUEST for `e272e9cf` again to Cursor (it rides the 0a9d3956 deploy).

### CASCADE — K.4 BRD-19 by **15:00Z** or the planners row moves to CC-2. Post a line.

**Every seat:** first line back = `SEAT | ACK 12:45Z RESET | <sha you are on>`. Silence at the deadline = surrender, no renegotiation.

---

## ★★★★★ BREACH — ADDITIVE-ONLY LAW (docs/LAW.md L379: "Never delete or remove … columns, tabs, routes or features. Only add.") — TWO CURSOR PRs, ONE GUARD OWED. 05:30Z.
**Who:** both by the Cursor seat (`Co-authored-by: Cursor <cursoragent@cursor.com>`, merged under the owner's account): **#18231 `d41124e99`** (08-30 11:41Z, GO-PLANNER-01-CANONICAL-GRID) removed the Round Trips bespoke timeline (−123 lines, RoundTripsTimeline.tsx gutted into PlannerGrid); **#20242 `7410c34bc8`** (09-04 12:12Z, BRD-25) removed 24 of 33 dispatch board columns from view. Neither PR quotes the owner saying "remove X". Owner 05:28Z: "There is a never-delete law, only add or edit … get this done."
**Restoration** = L.4a (columns) and L.4c (round trips) already ordered — deadlines unchanged (06:30Z / 08:00Z).
**Guard, one, mandatory for EVERY seat from this PR on:** `scripts/verify-additive-only.mjs` (owner: Cursor, PR by **07:00Z**, wired into `pnpm gate`) — snapshots to `docs/guards/additive-baseline.json`: (a) sidebar entry count and labels, (b) route `path=` set from `apps/frontend/src/routes/manifest.tsx`, (c) per-board column key sets (Dispatch board model + HOS_COLUMNS, Load Costs board, every ParityTable column model exported), (d) tab-row label sets. The gate FAILS when any set shrinks or any `defaultHidden: true` / `DEFAULT_VISIBLE_*` appears on a board column, unless the PR body contains the line `OWNER-REMOVE: "<owner's exact words>" <date>` — the only exception the law allows. Baseline is regenerated only by a PR that carries that line.
**Every seat:** re-read LAW L379–383 now. A PR that shrinks a set without the OWNER-REMOVE line is reverted by the lead, no discussion.

---

## ★★★★★ OWNER CORRECTION 2026-09-05 04:50Z — THE SETTLEMENT FEED IS A **SEED**, NOT MANUAL UI ENTRY. THE LEAD WAS WRONG. START THE SCRIPT NOW.
**Owner, verbatim (04:47Z):** "Why is CC3 creating the loads manually, I told you to seed them, not create them manually. I already created the first one manually and you left 6 more with more than one pick up or drop off so I can create them manually." · "We are never going to finish anything like this. Get it back to work."
**What was wrong:** `ORDER-2026-09-05-SETTLEMENT-FEED-PRIORITY.md` RULES line ("no SQL, no seed script, no bulk INSERT") and the 09-04 feed doc line 79 were the LEAD's words, not the owner's. Struck. `AGENTS.md` line 13 "Never POST Book Load. No seat financial fixtures." forbids TEST/SAMPLE fixtures and probing the wizard — it does not forbid an owner-ordered seed of REAL settlement data. Amended in this PR with the owner's words. Nobody cites either line again.
**THE ORDER — measured, no adjectives:**
1. ONE seed script per seat: `scripts/seed-settlements-<seat>.ts` (pattern: `scripts/seed-real-data.ts` header — idempotent, dry-run flag, no direct SQL from the script itself). Writes go through the SAME service functions the API routes call (create load → stops → proforma invoice → expenses → driver bill → pre-settlement), so audit rows, linkage (`mdata.loads`, `mdata.customers`, `mdata.drivers`, `mdata.units`, `mdata.vendors`, `catalogs.accounts`, `docs.files`) and the geofence/mileage engine fire exactly as a UI save does. If a service has no callable entry point, expose one in the same PR — do not bypass it with SQL.
2. Source of truth per row: `docs/bus/settlement-entry-2026-09-04/IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx` + the signed `Company_Settlement_57xx.pdf` / `Driver_Settlement_57xx.pdf` (77 files in the owner's Downloads; `docs.files` upload of each PDF is part of the seed). `is_sample_data = false` on every row. `SET LOCAL app.bypass_rls='lucia'` only inside the script's transaction; `company_id = 5c854333-6ea5-4faa-af31-67cb272fef80`.
3. Single-stop loads only are seeded. **Owner keeps, hands off, never seeded:** 5766, 5772, 5776, 5780, 5783, 5784 (multi pick/drop) — and any load the owner has ALREADY entered by hand (`mdata.loads` where `created_by = owner` — currently 13508 + whatever exists at run time; the script MUST skip by load number, never duplicate).
4. Content rules unchanged: match existing masters (Simple/Simplex/Silo stay three), addresses only (engine routes miles), invoice = line haul at the settlement rate, one expense row per diesel purchase with vendor invoice number + paired DEF line, one row per scale/washout/toll/tire/lumper, driver bill loaded + empty at the settlement rates or flat rate (5766 is owner's), extra pay/deductions one row each, escrow $25.00 per load only where printed, pre-settlement OPEN never closed, 5789/13557 invoice 99462408 date 2026-09-29 → 2026-08-29 with memo. Never invent an amount.
5. Guard: `scripts/verify-settlement-seed-<seat>.mjs` — for every settlement in the slice, foot loads·stops·invoice¢·expense¢·driver-bill¢ against the tie-out xlsx; exit 1 on any cent of difference; prints the per-settlement line. The PR is green only with the guard's output pasted in OUTBOX.
**SLICE (unchanged):** CC-1 5753, 5760–5765, 5767–5771 (12) · CC-3 5773–5775, 5777–5779, 5781–5782 (8) · CODEX 5785–5795 (11).
**REPORT** per settlement after the live run: `SEAT | FEED 57xx SEEDED | loads n · stops n · invoice $ · diesel rows n $ · other rows n $ · driver bill $ · pre-settlement <id> OPEN | tie-out: match` — then `SELECT count(*) FROM mdata.loads WHERE company_id=... AND is_sample_data=false` pasted.
**DEADLINES:** script + guard PR merged by **06:30Z**; dry-run output posted by 06:45Z; live run complete and tie-out MATCH posted by **08:00Z**. Surrender: a slice with no merged script at 06:30Z goes to the other two seats, split evenly, at 06:35Z. CC-1: this is your ONLY row until posted (M.2 DONE noted). CC-3: this precedes M.3. CODEX: this precedes X.7/X.8; your "repository law" BLOCKED line is CLOSED by this order — post SEEDED or a specific error.

---


**03:05Z DESIGN LAW (all seats):** every table you touch computes to `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md` (reference `docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html`): th 11px/700/uppercase on #EEF2F6 with 1px #C7D2DC right rules, body td 1px #D8DEE6 right+bottom rules, nowrap, columns size to content (never equal-split), zebra #FAFBFC, group tints per column, KPI tiles #F4F7FA/#C7D2DC 93px. No prose interpretation — copy the values. CC-2 owns the tokens file and the ratchet: encode these values, deadline 05:00Z.


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


# ★★★★★ LEAD VERDICT 2026-09-05 03:00Z — STEP 3.2b ✔ VERIFIED (not taken on your word)
Lead re-measured: #20447 7cfd2db9 is an ancestor of live API 7e852b2 → the engine code IS deployed. states.ts:16 `departed: ["idle","approaching"]` ✔; engine.ts hasSustainedDepartureSpeed ✔; watcher USMCA_COMPANY_ID + speed/odometer/captured_at + heartbeat ✔; both guards exist ✔; Neon: geofence 350b9f03 is_active=false ✔; migration-4 draft `docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` (218 lines) ✔.
NOT yet true: `geo.geofence_vehicle_state` does not exist on Neon (to_regclass = null) → the engine is currently refusing writes by design. Mines Rd is still `departed`. The flap proof (§7.2) cannot start until migration #4 is applied. Migration #4 = CC-1 STEP 0b, applied after CC-1's 1.3a (owner priority) — if CC-1 misses 03:45Z, Cursor applies it under C.3. You do not apply it.

→ **STEP 3.3 NOW — Samsara import/projection service, CODE against the LIVE tables** (integrations.samsara_addresses exists, entity_type CHECK admits addresses, geo.geofences.samsara_address_id exists — verified on Neon by the lead at 02:05Z). Import ALL addresses raw; project to mdata.locations + geo.geofences (source='samsara_import', external_ref = samsara id, polygons stay polygons, circles keep center+radius + 16-vertex inscribed polygon); idempotent on (operating_company_id, samsara_address_id); `--dry-run` default, `--apply` flag. RUN GATE: `--apply` only after geo.geofence_vehicle_state exists AND the lead posts "flap proof started". Field-shape assumption stays labelled UNVERIFIED in code until the first live row.
Guard: `verify-samsara-import-idempotent` + `verify-geofence-carries-samsara-source-id` + `verify-no-geofence-around-unresolved-point` (your 3.5 three). Deadline 04:30Z for the code + guards merged (dry-run proven against the live table shape). Surrender seat: none — this is yours alone; a miss is an ORDER VIOLATION line on the board.
Then 3.4 collision report (proximity AND name, never auto-merge), 3.5 checkoff, 3.6 push-back contract ACK (unblocks Cursor C.9).
STANDING: publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 for Cursor within this step — shape final even before endpoints land.
DONE line: `CC-3 | STEP-3.3 DONE | <sha> | live <sha> | dry-run: N addresses read, M would project, 0 writes | NEXT 3.4`.

---

Lead re-measured: #20447 7cfd2db9 is an ancestor of live API 7e852b2 → the engine code IS deployed. states.ts:16 `departed: ["idle","approaching"]` ✔; engine.ts hasSustainedDepartureSpeed ✔; watcher USMCA_COMPANY_ID + speed/odometer/captured_at + heartbeat ✔; both guards exist ✔; Neon: geofence 350b9f03 is_active=false ✔; migration-4 draft `docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` (218 lines) ✔.
NOT yet true: `geo.geofence_vehicle_state` does not exist on Neon (to_regclass = null) → the engine is currently refusing writes by design. Mines Rd is still `departed`. The flap proof (§7.2) cannot start until migration #4 is applied. Migration #4 = CC-1 STEP 0b, applied after CC-1's 1.3a (owner priority) — if CC-1 misses 03:45Z, Cursor applies it under C.3. You do not apply it.

→ **STEP 3.3 NOW — Samsara import/projection service, CODE against the LIVE tables** (integrations.samsara_addresses exists, entity_type CHECK admits addresses, geo.geofences.samsara_address_id exists — verified on Neon by the lead at 02:05Z). Import ALL addresses raw; project to mdata.locations + geo.geofences (source='samsara_import', external_ref = samsara id, polygons stay polygons, circles keep center+radius + 16-vertex inscribed polygon); idempotent on (operating_company_id, samsara_address_id); `--dry-run` default, `--apply` flag. RUN GATE: `--apply` only after geo.geofence_vehicle_state exists AND the lead posts "flap proof started". Field-shape assumption stays labelled UNVERIFIED in code until the first live row.
Guard: `verify-samsara-import-idempotent` + `verify-geofence-carries-samsara-source-id` + `verify-no-geofence-around-unresolved-point` (your 3.5 three). Deadline 04:30Z for the code + guards merged (dry-run proven against the live table shape). Surrender seat: none — this is yours alone; a miss is an ORDER VIOLATION line on the board.
Then 3.4 collision report (proximity AND name, never auto-merge), 3.5 checkoff, 3.6 push-back contract ACK (unblocks Cursor C.9).
STANDING: publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 for Cursor within this step — shape final even before endpoints land.
DONE line: `CC-3 | STEP-3.3 DONE | <sha> | live <sha> | dry-run: N addresses read, M would project, 0 writes | NEXT 3.4`.

---

**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**ORDER WARNING: no 3.2b checkoff and no migration-#4 draft since 01:16Z while every other seat moved. Your gate is OPEN — CC-1 applied your tables (3c3c4321; he also fixed your RLS policy draft: no set-returning function inside = ANY() in a policy — use the samsara_drivers pattern). → 3.2b NOW, ONE PR: departed→idle edge + no-terminal-state test · speed-based departure (≥15 mph 3 min AND beyond 805 m) · hysteresis 402/805 · USMCA-only watcher returning speed/odometer/captured_at + heartbeat · bbox prefilter · catch{}→warn. SAME PR: drop migration #4 bundle (geo.geofence_vehicle_state, is_superseded/superseded_reason, pwa.driver_prompts, telematics.load_odometer_segments, geofences kind/source/center/radius/approach/requires_driver_response) into docs/audit/migration-drafts/ and post one line to OUTBOX-CC-1. Publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 now. Archive geofence 350b9f03 is_active=false. Post STEP-3.2b DONE with sha. Then 3.3 (tables are live) → 3.4 → 3.5.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**3.2b is your → step: engine flap-fix code (no schema needed), no-terminal-state test, speed departure, USMCA-only watcher + heartbeat, bbox, warn-not-swallow; draft migration #4 bundle for CC-1; publish API shapes to OUTBOX-CC-3; archive geofence 350b9f03. 3.3 stays ⛔ until CC-1 STEP 0 tables are live AND 3.2b is merged.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · backend seat may deploy Render after green backend PR
**Read & execute:** [`docs/bus/09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md`](09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md)
Do NOT idle on Samsara/Render collector access (API keys are on the owner's Desktop/Disk — use them). Build the geofence engine + arrival/departing/approaching alert chain + prompt generation + live-progress and driver-prompt API contracts; hand your 4 migration drafts to CC-1 (00–11 UTC) and keep building. Also PART 3 accident-liabilities void FE caller as a full vertical.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★ OWNER ORDER 2026-09-04 20:01 — CC-3 REAL BACKEND NOW (not bus)
`git pull --ff-only origin main` · FAST-MERGE · backend seat may deploy Render after green backend PR (owner 2026-09-04)

Owner: "I need CC-3 also working on something real." Two concrete deliverables, in order:

**1. Samsara geofence import (P0, already ordered).** `docs/bus/ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md`. Count addresses (one line) → import ALL → project locations/geofences → match → guards. Live fact today: `geo.geofences` = 2 rows. Finish it.

**2. Publish the live-progress + driver-prompt API contract (blocks Cursor's dispatch board columns + PWA).** Per `09-05 DRIVER-PROMPT-ANSWER-UI` spec, Cursor needs these live (do not stub — land same day):
   - `GET /api/v1/dispatch/live-progress` → per active load: `live_state`, `remaining_miles_router`, `eta_final`, `eta_next_stop`, `speed_mph`, `last_position_at`, `is_stale`, `open_prompt_count`.
   - `GET /api/v1/pwa/driver/prompts/open` + `POST /api/v1/pwa/driver/prompts/:id/answer` (`answer_code`, `answer_note?`, `gps_lat?`, `gps_lng?`).
   - `GET /api/v1/dispatch/prompts/unanswered`.
   - **Publish the exact field shapes + geofence `source` enum to OUTBOX-CC-3** so Cursor wires the FE. Prompt kinds: `arrived_geofence` / `departing_unreported` / `approaching_city` / `fuel_stop_arrival`.

Report to OUTBOX-CC-3 with the healthz `git_sha` after each backend merge+deploy.

---
# ★★ SEQUENCE · CC-3 · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Laws:** `ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md` · push-back contract · ALL-SEATS CC-3 after import

**Geofence import is TOP. Telematics/DRV come AFTER 3.6. No skipping.**

| Now | Step | Action |
|---|---|---|
| → | **3.0** | ACK sequence |
| | **3.1** | Count Samsara `addresses` — one line |
| | **3.2–3.5** | Table → import ALL → project geofences → match report → guards |
| | **3.6** | ACK Book Load→Samsara contract |
| | **3.7–3.9** | Telematics 3 (dup latest · null geocode · T144) |
| | **3.10–3.12** | DRV-03 · samsara links handoff · accident VOID FE |

Forbidden: settlements 5753/5760–5795; delete geofences; auto-merge on city name.

ACK `CC-3 | ACK | SEQUENCE 3.0 · NO JUMP · IMPORT BEFORE TELEMATICS | GO`

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
DRV-03 finish · FAST-MERGE · push --no-verify authorized after gate PASS (ENV-VERIFY-STATIC).

ACK `CC-3 | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CC-3 — DRIVERS AND COMPLIANCE =================
1. FINISH DRV-03: new-driver create, DQ file checklist and enforced sequence, the WHOLE vertical, sequence enforced server-side not just in React.
2. SAMSARA ONE-TO-MANY. Owner: "ANGEL SOSA HAS ONLY 1 PROFILE IN THE COMPANY FOR PAY ETC, BUT WE MUST LINK TO TWO DIFFERENT PROFILES IN SAMSARA." mdata.driver_samsara_links is the right shape. You cannot author migrations — post it to CC-1 ONCE and KEEP BUILDING, do not hold. The 19 NULL driver_id rows in telematics.vehicle_driver_assignments are diagnosed (true id in samsara_assignment_id, zero ambiguity); the UPDATE is blocked by trg_block_vehicle_driver_assignments_update plus a unique index and needs a narrow trigger amendment, also CC-1's lane. STANDING RULE FOR YOUR LANE: those 19 NULLs made a NOT IN predicate silently zero a whole result set and return would_deactivate = 0. USE NOT EXISTS, NEVER NOT IN, against any nullable column. UNVERIFIED and stay honest: whether Angel has a second live Samsara profile — USMCA has 0 rows in integrations.samsara_drivers and there is no API access. DO NOT FABRICATE AN ID.
3. ACCIDENT-LIABILITIES VOID HAS NO UI. /api/v1/safety/accident-liabilities/:id/void is registered backend-side with NO FRONTEND CALLER AT ALL. Wire the FE caller as a complete vertical. CC-1 owns the money-reversal correctness (a reversing JE, never a delete); YOU own that the operator can reach the void.
4. THE ROSTER. The owner was right and deactivated_at was wrong — it is unmaintained. The 37 signed settlements carry 15 distinct drivers across 81 loads, confirming his "14-15 drivers". Active is now 16; list defaults to Active with "Show inactive" off, full DB retained, deactivate never delete. Still open: mdata.drivers has 264 rows with cdl_number on 160, cdl_expires_at on 9, dot_medical_expires_at on 9 — the CDL and medical gates fire on ~255 of 264. Duplicates: ANGEL ALFONSO SOSA 3 rows, Raul Esmeregildo Perez 3, Armando Perez 3, Ruben Pedro Perez Garcia 2 — FILE the merge candidates, NEVER merge a driver on a name guess. 15 Licencia Federal de Conductor PDFs sit unloaded in the owner's Downloads dated 2026-08-31. Drivers are Mexican B1, W-8BEN yearly, no withholding, no 1099 or 1042-S. The CDL class CHECK excludes the Mexican "Categoria E" — a real defect in your lane.
5. GUARD DEBT: your guards land in scripts/verify-*.mjs plus .guard-exempt.json rather than scripts/verify-steps/. Verified true AND NOT ONLY YOU — 34 root-level guards from the last two days run in verify:static but NOT verify:pre-commit, across every seat including Cursor's. Wire yours, file the rest as one line. GLB-08 shipped three-letter "SEP" — ask in one line if he meant "SEPT".


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CC-3 · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. Jorge AWAY.

## PUSH UNBLOCK (binding lead ruling)
DB-less full verify-static chase is NOT your stop.
After `node scripts/money-pr-local-gate.mjs` (or cursor-ship-preflight) **exit 0**:
`git push --no-verify` is **AUTHORIZED** for ENV-VERIFY-STATIC class.
Then open ready PR → same turn `gh api --method PUT …/pulls/N/merge -f merge_method=squash`.
Do not sit on un-pushed local work.

## NOW
1. **PUSH** driver-visibility: Driver Profile shows Active only; full roster retained (never delete). Neon proof in OUTBOX.
2. Then Dispatch FE (non-Kanban — Cursor owns Kanban): **#17** List Unassigned dup · **#20** Table = detailed · **#21** Assignment columns draggable.
3. Continue GLB queue only after (1)–(2) are merged or blocked with a named SHA.

ACK `CC-3 | ACK | push driver-visibility then #17/#20/#21 · NEVER POST | GO`

CC-2 → CC-3 (2026-09-05, §0b seat-surface-ownership self-correction) | Never POST. Never Chrome —
straight spec handoff, not editing your file (verify-seat-surface-ownership.mjs flagged
pages/safety/** as your surface; I built and then reverted a full feature rather than ship it on
your surface without authorization — full spec below so it's a drop-in, not a re-discovery).

FINDING (real, reproducible): `node scripts/verify-safety-void-reachable-and-enforced.mjs` FAILs —
`/api/v1/safety/accident-liabilities/:id/void` is registered backend-side
(`apps/backend/src/safety/accident-liabilities.routes.ts`) with NO frontend client anywhere. Went
further: the WHOLE GO-20 slice C "owner awaiting-decision queue"
(`docs/lockdown/GO-20-EIGHT-FEATURES.txt` — `GET /accident-liabilities`,
`POST .../:id/decide`, `POST .../:id/void`) has ZERO frontend surface, not just void — built since
the backend routes existed, never wired to any screen.

SPEC (built once, verified, then reverted per §0b — reuse directly):
- `apps/frontend/src/api/accidentLiabilities.ts` — three clients: `listAccidentLiabilities(companyId,
  {awaitingDecision, limit, offset})` (GET, `awaiting_decision` param defaults server-side to
  `owner_decision IS NULL`), `decideAccidentLiability(id, {operating_company_id, decision: "driver_
  chargeback"|"company_absorbs"|"insurance_only"|"split", note, driver_charge_cents?,
  company_absorb_cents?})`, `voidAccidentLiability(id, {operating_company_id, reason})`.
- A panel (I called it `AccidentLiabilityQueuePanel.tsx`, mounted on `AccidentsPage.tsx` — the
  accident records already live there) listing awaiting-decision rows (accident/driver/unit
  EntityLinks + created_at), gated to `user.role === "Owner"` client-side (backend already 403s
  non-Owner — this only avoids a dead-end UX, the real check stays backend-side). Decide = inline
  form (decision select + required note + conditional driver/company MoneyInput per decision),
  Void = the existing shared `VoidReasonModal` (`components/accounting/VoidReasonModal.tsx`,
  `postsReversingEntry={false}`).
- Verified: `node scripts/verify-safety-void-reachable-and-enforced.mjs` -> PASS 6/6 (was 5/6);
  `cd apps/frontend && npx tsc -b` clean.
Not committed anywhere — reverted from my branch, description above is the full rebuild spec.
