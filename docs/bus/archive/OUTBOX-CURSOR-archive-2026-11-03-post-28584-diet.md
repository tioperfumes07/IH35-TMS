# Cursor OUTBOX archive slice 2026-11-03 post-#28584 diet

## OUTBOX (11-03-2026 ~5:30 PM CT) — ENG-34 wire live-fails-225-229-233-241
- **PRIOR:** #28563 D066 z-index plant.
- **THIS:** verify-steps 19867 wires verify-live-fails-225-229-233-241 (ENG-34 orphan residual = match-vendor only).
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:25 PM CT) — D066 z-index plant on unmatched-7d guard
- **PRIOR:** #28561 Settlements week company-calendar ISO + deductions caption.
- **THIS:** verify-unmatched-7d-is-an-alert selftest adds D066 z-[50]→z-[220] plant (Codex inbox gap). Scan already required z-[50].
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:15 PM CT) — Codex batch91/92 Settlements week TZ + deductions caption
- **PRIOR:** #28557 Manual JE #241 size=sm MERGED-UNVERIFIED.
- **THIS:** Settlements week buckets → companyWeekStartSundayIso / weekStartIso (America/Chicago); formatWeekOfTitle prefers bare ISO; deductions title `Deductions · Week of …` (batch91); honesty plants CT/caption. Live UNVERIFIED.
- **NEXT:** live DONE-LIVE #241 + Settlements week; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:10 PM CT) — FAILED-LIVE #241 Manual JE Class/Debit
- **PRIOR:** #28555 Codex settlement/reimburse verify; ROUND 7.30g reopened #241.
- **THIS:** Manual JE Step 2 Account/Class ReferenceSelect size="sm" (drop FILTER min-w-[10rem] ~142px that overlapped Debit ~27px); verify-ui4 size=sm plant; ManualJEModal vitest layout proof (no min-w-[10rem], h-10 form chrome). PENDING #241 → MERGED-UNVERIFIED. Live UNVERIFIED.
- **NEXT:** live DONE-LIVE #241; other FAILED-LIVE are CC-3/Lead; no match/Dreamline.

## OUTBOX (11-03-2026 ~12:00 AM CT) — ENG-34 wire new orphans; match still deferred
- **PRIOR:** #28551 orphans 6→1.
- **THIS:** verify-steps 19863/19865 wire person-confirms-load + customers-vendors-home-boards. ENG-34 orphan residual = match-vendor only.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:55 PM CT) — ENG-34 orphans 6→1 (match residual)
- **PRIOR:** #28548 Cursor orphan wire 11→6.
- **THIS:** verify-steps 19853–19861 wire CC-1 rows/dates/reports/113-54/164-readers. ENG-34 orphans 6→1 (only verify-match-vendor — deferred, no match). 
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:50 PM CT) — ENG-34 wire Cursor orphans 11→6
- **PRIOR:** #28546 tip #103.
- **THIS:** verify-steps 19843/45/47/49/51 wire inputs-height · names-proper-case · relay-driver-links · driver-endpoints-set-based · ui4-d065..d076. ENG-34 orphans 11→6 (remaining CC-1/Lead/Cascade/match). #27/#29/#103 MERGED-UNVERIFIED.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:40 PM CT) — ROUND 7.30 tip #103 static ratchet
- **PRIOR:** #28544 tip #27 MERGED-UNVERIFIED.
- **THIS:** PENDING #103 → MERGED-UNVERIFIED (verify-static-ratchet PASS seeded/378). #27/#29 MERGED-UNVERIFIED. Live DONE-LIVE remaining.
- **NEXT:** live DONE-LIVE proofs; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:30 PM CT) — ROUND 7.30 #27 tip MERGED-UNVERIFIED + ItemsCatalog
- **PRIOR:** #28543 Accounting detail need-company wave 7.
- **THIS:** ItemsCatalog BoardSection need-company; PENDING #27 → MERGED-UNVERIFIED (~67 surfaces; Reclassify/match/LoadCosts skipped; live UNVERIFIED). #29 already MERGED-UNVERIFIED.
- **NEXT:** live DONE-LIVE / Cursor #103 static reds; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:20 PM CT) — ROUND 7.30 #27 Accounting detail need-company wave 7
- **PRIOR:** #28540 tip #27/#29 status.
- **THIS:** 13 Accounting *Detail* pages BoardSection need-company; fill-shell plants (~54→~67). #27 still PARTIAL (Reclassify/match/LoadCosts skipped). #29 MERGED-UNVERIFIED. SURFACE-BREACH CC-1 for ROUND 7.30 #27.
- **NEXT:** live DONE-LIVE / remaining shells; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:10 PM CT) — ROUND 7.30 tip #27/#29 status
- **PRIOR:** #28539 tip #29 MERGED-UNVERIFIED.
- **THIS:** PENDING #27 stays PARTIAL (~54 Accounting need-company via #28518–#28537); skip Reclassify (Batch75 CC-1) + ReconciliationWorkspace (match). #29 tip #28539. Lead owns dates/UI.
- **NEXT:** Accounting detail need-company / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~11:05 PM CT) — ROUND 7.30 #29 popup standard tip
- **PRIOR:** #28538 reimbursements formatUsd guard.
- **THIS:** PENDING #29 → MERGED-UNVERIFIED — verify-popups-one-format overlays baseline 0 (shared Modal/ParityDrawer); FuelAssignmentPopup sizePreset md 720 (V3-Modal-FuelAssignment / 443.295); verify-fuel-assignment-popup PASS. Live owner walk UNVERIFIED. #27 PARTIAL (~54 need-company). Batch75 Reclassify → CC-1.
- **NEXT:** #27 remaining detail / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~10:55 PM CT) — Codex batch90 reimbursements formatUsd guard
- **PRIOR:** #28537 Accounting need-company wave 6.
- **THIS:** verify-reimbursements-section-uses-paritytable requires formatUsd(line.amount)+formatUsd(subtotal); token-only selftest plant. UI already correct. #27 PARTIAL; #29 OPEN.
- **NEXT:** #29 popup / Accounting detail; no match/Dreamline.

## OUTBOX (11-03-2026 ~10:45 PM CT) — ROUND 7.30 #27 Accounting need-company wave 6
- **PRIOR:** #28535 Settlements week chart → Week-of.
- **THIS:** Loans/QBO recon/drift/captures/Maintenance shop hub/Accounting hub/Account type catalog/Check print BoardSection need-company; fill-shell plants. #27 still PARTIAL (~54). SURFACE-BREACH CC-1 for ROUND 7.30 #27. Batch75 Reclassify → CC-1.
- **NEXT:** #29 popup / remaining Accounting detail; no match/Dreamline.

## OUTBOX (11-03-2026 ~10:30 PM CT) — Settlements week chart → Week-of select
- **PRIOR:** #28534 Accounting need-company wave 5.
- **THIS:** Settlements home historical week bars set `week_start` + Week-of/deductions follow selected week (Codex batch88); accessible role=button bars; honesty plant. #27 PARTIAL; #29 OPEN. Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** #29 popup / more Accounting need-company; no match/Dreamline.

## OUTBOX (11-03-2026 ~10:15 PM CT) — ROUND 7.30 #27 Accounting need-company wave 5
- **PRIOR:** #28532 Accounting need-company wave 4.
- **THIS:** Account register/Audit trail/Pre-settlements/CoA roles/Expense category map/Factor recon/Integration txns/Proof trail/Month close/Opening balance/Posting lineage/Batch expenses/Abandonment/Dispute queue/Revenue recognition BoardSection need-company; fill-shell plants. #27 still PARTIAL. SURFACE-BREACH CC-1 for ROUND 7.30 #27. Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~10:00 PM CT) — ROUND 7.30 #27 Accounting need-company wave 4
- **PRIOR:** #28528 Accounting need-company wave 3.
- **THIS:** Bills/Payments/Factoring/AP aging/Transaction register/Prepaid/Checks/Recurring bills/Vendor balances/Allocations/Sales tax/Payroll/Cash forecast/Period comparison/Daily recon/Undeposited funds BoardSection need-company; fill-shell plants. #27 still PARTIAL. Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:45 PM CT) — hotfix MyAccountant need-company landed
- **PRIOR:** #28525 empty merge; fill-shell stayed red.
- **THIS:** #28526 MyAccountant BoardSection need-company early return; fill-shell PASS. #27 PARTIAL. Remaining: more Accounting tabs + #29 popup (+ Lead date/UI live). Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting need-company / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:40 PM CT) — hotfix MyAccountant need-company
- **PRIOR:** #28522 tip #27 PARTIAL.
- **THIS:** MyAccountant BoardSection need-company (fill-shell plant was red on main after #28521). Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:30 PM CT) — ROUND 7.30 #27 PARTIAL tip
- **PRIOR:** #28521 Accounting need-company wave 2.
- **THIS:** PENDING #27 → PARTIAL (9 Accounting surfaces BoardSection need-company via #28518/#28521; more tabs remain). Remaining Cursor: #27 rest + #29 popup (+ Lead date/UI live DONE-LIVE). Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:20 PM CT) — ROUND 7.30 #27 Accounting need-company wave 2
- **PRIOR:** #28518 Leases/Disputes/Receipts/FixedAssets need-company.
- **THIS:** Vendor credits · Credit memos · Collections · Payment methods · My Accountant BoardSection need-company. #27 still OPEN (more tabs). Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:10 PM CT) — ROUND 7.30 #27 Accounting need-company wave
- **PRIOR:** #28517 tip #25 statement.
- **THIS:** Leases/Disputes/Receipts/FixedAssets BoardSection need-company; Leases asset/bill counts → formatQuantityTable. #27 Accounting tabs still OPEN (more tabs remain). Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** more Accounting tabs / #29 popup; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:00 PM CT) — ROUND 7.30 tip #25 statement
- **PRIOR:** #28516 tip #16 443.282.
- **THIS:** PENDING #25 Statement 5753-format surfaces → MERGED-UNVERIFIED (workflow+board+fuel+linked records present; live 5753 compare UNVERIFIED). Remaining Cursor OPEN: #27 Accounting tabs inspect, #29 popup standard (+ Lead date/UI). Batch75 Reclassify → CC-1.
- **NEXT:** #27/#29 or live DONE-LIVE proofs; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:55 PM CT) — ROUND 7.30 tip #16 443.282
- **PRIOR:** #28515 tip OPEN Factoring/Fuel/Settlements boards.
- **THIS:** PENDING #16 443.282 Factoring board-exact → MERGED-UNVERIFIED (verify-factoring-layout-tabs-first PASS; live owner confirm UNVERIFIED). Remaining Cursor code: #25 statement 5753, #27 Accounting tabs inspect, #29 popup standard (+ Lead date/UI). Batch75 Reclassify → CC-1.
- **NEXT:** #25/#27/#29; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:45 PM CT) — ROUND 7.30 tip #77 Factoring/Fuel/Settlements OPEN boards
- **PRIOR:** #28512 tip rebuilt PARTIAL boards.
- **THIS:** PENDING #77 statement drills + #52 Factoring Home + #57 Settlements Home + #62 Close + #66 Escrow + #68-69 Fuel + #4 nav N1-N10 → MERGED-UNVERIFIED (boards present; live UNVERIFIED). Remaining: #25 statement format, #16 process, #27/#29 broad OPEN. Lead owns dates/UI. Batch75 Reclassify → CC-1.
- **NEXT:** #25 statement / broad OPEN; no match/Dreamline.
