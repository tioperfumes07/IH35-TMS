# TO: CC-1 — ROUND 326.1 — TRANSPORTATION REVREC LEAK: REVERSE, THEN DELETE
Claude Lead 2026-10-02 · USMCA 5c854333-6ea5-4faa-af31-67cb272fef80 · prod br-fancy-credit-akjnd07a

## MEASURED LIVE (bypass_rls='lucia', read-only) — THIS IS WHY AUGUST DOES NOT TIE
Owner source of truth: ~/Downloads/10-1-26-Usmca-Faro-Always-Reconciliation.xlsx,
sheet QBO-FARO-Allways, column M "Company" = IH. 26 rows. THAT COLUMN IS THE DISCRIMINATOR.
The 09-30 "Import block?" flag is WRONG — it stamps YES on closed settlements 5769-5819. Do not use it.

21 IH 35 TRANSPORTATION loads are live under the USMCA operating company:
  cancelled (6): 13485 13487 13493 13494 13496 13500
  active  (15): 13498 13502 13503 13504 13505 13506 13507 13509 13517
                13522 13525 13530 13531 13533 13539

accounting.load_revenue_recognition_postings, status='posted' AND is_active AND voided_at IS NULL:
  40 LIVE POSTED JOURNAL ENTRIES on 20 of those 21 loads
  GROSS $146,898.00  ($73,449.00 each side) of TRANSPORTATION revenue recognized in USMCA's ledger
  Event 1 "earn" + Event 2 "bill" per load. created_at 2026-09-24 14:xx by user e4117991-d2c0-406d-8cda-74e98d95bccd
  per load: 13485 4078 · 13487 9800 · 13493 8000 · 13494 7600 · 13496 6000 · 13498 7600 · 13500 7000
            13502 7600 · 13503 9800 · 13504 9800 · 13505 7800 · 13506 7800 · 13507 2400 · 13509 8800
            13517 7600 · 13522 7000 · 13530 3000 · 13531 8600 · 13533 6900 · 13539 9720
accounting.invoices non-void on those loads: 3 — load 13498 sent $3,800.00 open ·
            load 13517 sent $3,800.00 open · load 13525 sent $0.00. not_factored, $0 paid.
Other primitives on the 6 cancelled: invoices 0 · factoring_purchase_lines 0 · expenses 0 ·
            driver_bills 0 · settlement_lines 0. is_sample_data=false on all 6.

## THE DEFECT
Cancelling a load does NOTHING to its revenue recognition. 6 loads carry status='cancelled'
and still carry 2 live posted JEs each. The cancel path does not reverse revrec. That is the root cause
and it is a general defect, not a data problem — it will do this again on the next cancel.

## OWNER ORDER — 2026-10-02 — COMPLETE DELETE ROUTE. READ THE LAW UPDATE FILE FIRST.
All 21 TRANSPORTATION loads are DELETED from USMCA. Not voided. Not cancelled. Not moved-and-left.
They should never have been in our app and no trace of them may remain. The prior void-not-delete
law does NOT apply here — the owner superseded it. No void records, no reversal pairs, no shells.

## YOU BUILD, YOU FINISH. NO HANDOFF. ENGINES ONLY — YOU FEED NO DATA. NO CHROME VERIFICATION.
1. ROOT FIX — the load-cancel path. Cancel currently does NOTHING to revenue recognition: 6 loads sit
   cancelled with 2 live posted JEs each. Cancel must settle revrec. Name the file and line that was
   missing it. Reuse the existing revrec engine. No new GL math, no handwritten journal entries.
2. ROOT FIX — entity resolution on import. Find why the 09-23/09-24 AlwaysTrack import wrote
   TRANSPORTATION loads under USMCA. Inbound loads resolve operating company from the AlwaysTrack/Faro
   source entity — never a default, never the session company. Unresolvable = reject with a named
   reason, never silently assign.
3. EXECUTE THE COMPLETE DELETE on all 21 loads, one transaction, in this order:
   a. delete the 40 load_revenue_recognition_postings rows and the journal entries and journal entry
      lines they created, so the ledger never carried the $146,898.00
   b. delete the 3 invoices (13498, 13517, 13525) and their invoice_lines — do not void them
   c. remove any banking match rows pointing at them, via the shared
      POST /api/v1/bank-recon/unmatch engine, then delete the match rows
   d. delete every dependent row across: invoice_lines, invoice_disputes, expense_lines, expenses,
      factoring_purchase_lines, factoring_advances, revenue_contracts, load_revenue_recognition_postings,
      driver_bills, settlement_lines, settlement_contract_lines, driver_settlement_deductions,
      escrow_ledger, escrow_deductions_pending, driver_advances, driver_reimbursements,
      broker_advances, cash_advance_requests, deduction_recovery_links, abandonment_chargebacks,
      equipment_loan_attributions, team_settlement_splits, presettlement_link_suggestions,
      signed_acknowledgments, historical_settlement_attribution_items, load_stops,
      dispatch.load_assignment_history, dispatch.load_charge_lines, docs.files links
   e. delete the 21 mdata.loads rows
   Measured pre-state: the 6 cancelled carry invoices 0, factoring 0, expenses 0, driver_bills 0,
   settlement_lines 0 — only revrec. Verify every table in (d) yourself before and after; a FK error
   mid-transaction means you missed a child table, so find it, do not force.
4. GLOBAL CLEAN SWEEP ENGINE, same PR. USMCA must hold no void, no cancelled shell, no test data:
   - every record with is_sample_data = true
   - row E2E-2E-95603e75 and any other E2E/demo/sample/test identifier
   - every voided invoice, voided journal entry, voided revrec posting, voided expense, voided
     settlement that has no live counterpart — including docref 5819 (cancelled/voided, no PDF)
   Each deletion recorded in an audit table with what it was and why. Ledger balances after.
   Do NOT delete docrefs 5817 and 5818 — they are unidentified, not void; they stay for the owner.
5. LINKAGE DECLARATION in the PR body, both directions, for all 21: customer, vendor, driver, unit,
   trailer, invoice, settlement, journal entry, factoring purchase, banking match, docs.files.
   Money double-sided, reversible, routed both ways.
6. GUARDS, both wired into verify-static, shrink-only:
   - scripts/verify-no-cross-entity-loads.mjs — fails if any load whose AlwaysTrack/Faro source entity
     is IH 35 TRANSPORTATION exists under USMCA; fails if any cancelled load anywhere carries a live
     posted revrec posting
   - scripts/verify-usmca-clean-no-voids-no-fixtures.mjs — fails on any is_sample_data=true row, any
     E2E/demo/test identifier, and any voided record with no live counterpart, in USMCA

ONE PR. DEADLINE 2026-10-03 23:00 UTC. Missed = CC-2 takes the surface.
You feed no data into USMCA for any reason, including proof.

## DONE LINES — paste the live output, owner re-measures these
- all 21 load_numbers in mdata.loads = 0 rows
- revrec postings on all 21 (any status) = 0 rows
- invoices on all 21 (any status) = 0 rows
- every child table in step 3d returns 0 rows for those 21 load ids
- ledger DR = CR, 0 unbalanced journal entries, and the $146,898.00 is gone from both sides
- USMCA: is_sample_data=true rows = 0; E2E/demo/test identifiers = 0; voided records with no live
  counterpart = 0; docrefs 5817 and 5818 still present
- the cancel-path file+line that failed to reverse revrec, and the engine that now does
- guard output, 0 violations

# ============================================================================
# CC-1 — YOUR COMPLETE QUEUE, IN SEQUENCE. FINISH ALL 18. NO SKIPPING. NO HANDOFF.
# ============================================================================
Work them in this order — the order is dependency-real, not preference. Each one is FULLY COMPLETE
per module before you move: engine built, wired, linked, double-routed, reversible, mechanical +
economic + money/finance, linkage declaration in the PR body. You feed NO data. No Chrome.
Report only: what I built · the live proof · what's next. Mark each DONE with re-measurable output.

 1. TRANSPORTATION COMPLETE DELETE — all 21 loads, both root fixes, global clean-sweep engine,
    2 guards. Everything above this line in this file. 2026-10-03 23:00 UTC.
 2. SETTLEMENT ROW MISSING settlement_model — 3-line fix. DO THIS SECOND: it is blocking CC-3's
    load-drawer mount. Tell CC-3 the moment it is on main.
 3. G-02 · accounting.bills = 0 — THERE IS NO A/P SUBLEDGER. Build it. Account 2000 shows 170
    postings netting DR $5,053.19 = CR $5,053.19 because expenses pass through it. No open items,
    no aging, no vendor balances exist. A/P must become a real subledger.
 4. G-03 · accounting.bill_payments = 0. Cash advances $2,275.96 post as
    source_transaction_type='driver_cash_advance' (24 postings). CLOSED DECISION: cash advances ARE
    bill payments — DR 2000 A/P · CR 1000 bank. Requires item 3 first.
 5. G-04 · SETTLEMENT GL CHAIN HAS NEVER RUN. driver_settlement_gl_runs = 0,
    driver_settlement_gl_bills = 0. Build the path that creates the accounting bill, the cash bill
    payment and the deduction bill payment per settlement. Requires items 3 and 4.
 6. G-09 · ITEM CATALOG DOES NOT MATCH THE SIGNED PDFs. Build the catalog + mapping engine.
    MISSING ITEMS: Road Service-Trailer Tire Expense · TRACTOR-Washout Expense ·
    Driver Reimbursement-TPE-Scale Expense · Driver Reimbursement-TPE-Toll Expense.
    NAME DRIFT: Reefer Trailer-Washout · Warehouse-Lumper Fee · Fuel-Reefer Diesel ·
    Road Service-Truck Repair. WRONG ITEM: OTR-Mexico Tolls & Intl Bridge booked to Highway Toll
    Expense-USA · Driver Reimbursement-Fuel-Def booked to Driver Reimbursement-Company Vehicle Fuel.
 7. G-01 · DOCUMENT EXPENSES ONLY 29% PRESENT. Signed PDFs (48 in-scope settlements) carry
    255 lines / $12,764.27. App DOOR-1 expenses with source_settlement_ref set: 75 / $5,203.67.
    GAP 180 lines / $7,560.60. BUILD THE INGESTION ENGINE that reads the signed settlement document
    and creates those lines against the item catalog from item 6. YOU DO NOT FEED THE ROWS — you
    build the engine and hand the owner the run. Never touch the bank.
 8. G-05 · EVERY SETTLEMENT LINE IS UNCATEGORIZED. 311 active in-scope lines with item_id NULL,
    posting_account_id NULL, category NULL on all 311. Build the categorization engine driven by
    item 6's catalog, so the line ties to the PDF.
 9. G-10 · 31 OF 67 deadhead_pay LINES ARE $0.00 while the PDFs print Empty Miles dollars on those
    loads. Fix the engine that computes deadhead pay, not the rows.
10. G-08 · 9000 ASK MY ACCOUNTANT — 128 postings, $3,631.73 parked uncategorized. Every one gets a
    real account through the engine.
11. G-06 · 1090 UNDEPOSITED FUNDS RESIDUE $150,283.02 (DR $546,314.40 / CR $396,031.38).
    Day-close assertion 14 forbids any 1090 residue. Find why it accumulates and close the path.
12. G-07 · 2510 DREAMLINE DIESEL CARD PAYABLE $149,793.68 OPEN (CR $193,977.22 / DR $44,183.54).
    The fuel card liability accrues with almost no payment side. Build the payment side.
13. G-18 · 6300 BANK SERVICE CHARGES — DR $174,646.12 / CR $174,426.12. $174K of gross churn for
    $220 net. Explain the gross movement and stop it before any close.
14. G-16 · CHECK CREATOR IS BUILT BUT HAS NEVER ISSUED A CHECK AND TODAY CANNOT.
    banking.check_stock_settings 0 rows · check_number_registry 0 · check_print_batches 0 ·
    check_print_batch_items 0 · checks issued 0. All 517 expenses payment_type='expense',
    print_status='not_set', 0 check numbers. No next_check_number, no check_type, no print offsets
    on any bank account. Commission it.
15. RECLASSIFY — invoice / bill_payment LINE REWRITE. Reported "not rewritten" while the ledger
    still moves. That is a silent half-write. Fix at root.
16. E-17 · FLEET ROSTER INTEGRITY — still kind:"pending" in engine-status.catalog.ts. Build it.
17. FOUR APPLIED-BUT-NEVER-COMMITTED MIGRATIONS. In prod's ledger, absent from git history:
    202614420000_fuel_transactions_genesis_anchor_gross_cost_discount_fee.sql
    202614430000_fuel_transactions_genesis_anchor_gross_cost_discount_fee.sql
    202614560000_geocode_precision_google_native_values.sql
    202614570000_fix_driver_samsara_accounts_rls_empty_uuid_cast.sql
    Verified by git log --all --diff-filter=A returning zero for all four. Recover the real applied
    SQL from the ledger, commit the exact bytes, register checksums. Never reconstruct from memory.
18. THE 33 AMBIENT GUARD FAILURES ON main. One (verify-rls-uuid-cast-nullif) is fixed on branch
    claude/fix-rls-uuid-cast-nullif-driver-samsara. Enumerate the remaining 32, state which are real
    defects and which are stale guards, and clear them. A red guard on main is a broken gate.
