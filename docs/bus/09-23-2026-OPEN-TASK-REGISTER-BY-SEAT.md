# OPEN TASK REGISTER — BY SEAT — as of 2026-09-23
# Nothing here is done. Everything done is in the DONE section at the bottom.
# A seat closes a line ONLY with live proof pasted into its outbox.

## CC-1  (schema, writers, feed callers)
 1. P0  STOP WRITER. mdata.load_stops carries facility_name, street, city, state, zip, sequence,
        stop type, scheduled AND actual arrival AND DEPARTURE, leg_miles.
        WHY IT IS P0: Cursor's I2 measured 22 delivered loads with no issued invoice, 82,587.00,
        and only ONE has delivery evidence. revrec reads finalActiveDeliveryDepartureAt off the
        stop rows and finds nothing. The columns went live and nothing writes them.
        INPUT READY: 06-OUTPUT/feed_input.json — 355 stops, 353 facility names, 227 leg miles,
        124 of 124 loads with a delivery departure date and named consignee.
 2. E6  Four feed callers onto createLoadWithFullSideEffects (inbound-204.handler.ts et al).
        ANSWERS SO YOU ARE NOT BLOCKED: machine caller gets a NEW system actor, never a borrowed
        human user; customer_id resolves from the settlement document's named consignee; the
        appointment-required gate does not apply in mode='historical_backfill'; trailer comes
        from the document's Trlr: field.
 3. E14 remainder — pre-settlement identifier that does not require source_document_ref.
        The feeder NEVER mints a settlement number; source_document_ref is set only once
        AlwaysTrack settles.
 4. ITEM AND LINE SCHEMA (Round 83 R3 / Round 84 P2). catalogs.item_categories; and on
        bill_lines, invoice_lines, settlement lines and the load-cost line:
        item_id, quantity NUMERIC (3dp gallons / 1dp miles), rate_cents, amount_cents COMPUTED,
        unit_of_measure, and a CHECK that refuses a row where the three disagree.
        CC-1 LANDS THE TABLE. CC-3 LANDS THE ROWS. Do not seed the catalog.
 5. DEDUCTION CHAIN SCHEMA (Round 88). customer_deduction (load_id, invoice_id,
        reason_account_id, fault customer|broker|us-office|us-driver|unknown, is_disputed,
        source_document) and driver_deduction (load_id, driver_id, item_id,
        originating_deduction_id, installment plan). Plus 1255 Driver Deduction Receivable
        (parent, non-postable) + 1255-NNN per driver, auto-numbered.
        NO NEW GL MATH — reuse the existing posting engines. No posting path: STOP AND REPORT.
 6. UNFREEZE YOURSELF (Round 86). verify-fuel-transactions-per-load.mjs EXPECTED_COUNT to the
        live figure, comment citing Round 86, baseline PROVISIONAL UNTIL THE PURGE. Then push the
        two held production fixes: the identity service-account row, and
        fuel_transactions.source_row_hash NOT NULL + unique. Both are schema. Both survive.
 7. E9  display_id.        8. E10 void paths.
 NOT YOURS: Round 83 R1 account-number visibility (CC-2). R2 auto-numbering (CC-3).

## CC-2  (UI, boards, advance writer)
 1. ACCOUNT NUMBERS HIDDEN APP-WIDE (Round 83 R1). Default OFF everywhere — chart, JE detail,
        registers, bills, invoices, settlements, load costs, reports, every picker and dropdown,
        exports, printed documents. ONE central display helper, not 40 page edits. Filter toggle
        "Show account numbers", off on every fresh load, may persist per user once turned on.
        GUARD: fails if any surface prints account_number outside the helper.
 2. ITEM LINES ON SCREEN (Round 83 R3). item | description | QTY | RATE | AMOUNT, amount
        read-only. Diesel shows gallons and price per gallon. DEF its own gallons. Loaded/empty
        miles show miles and CPM. Blank is a dash, never a zero.
 3. E11 boards D2 -> D4 -> D3. Every board type renders the same data: truck dispatched, pending,
        load costs for assigned and unassigned, pre-settlements.
 4. ADVANCE WRITER. escrow is NOT the fee (they are equal on all 120 rows today because
        factoring_advances.reserve_amount_cents = factor_fee_cents on 120 of 120 — the source row
        carries the same number twice). Wire fee deducted. Populate faro_invoice_number and
        faro_purchase_date.
        MODEL NOW PROVEN: advance = face x 0.9700 exactly; flat 10.00 wire fee on 19 invoices;
        identity face - escrow - cash reserve - discount - fees - dispatch - schedule fee =
        net advance, holding on 82 of 82 funded invoices.
 5. DEDUCTION SCREENS (Round 88). Reason picker (nine 49xx reasons BY NAME) + fault picker
        + dispute toggle; driver-recovery prompt when fault = us-driver; open-deduction and
        driver-receivable register.
 6. ACCESSORIALS render as their own rows on the invoice and in load costs. NEVER collapsed
        into line haul.

## CC-3  (chart, items, extractor)
 1. RETIRE GL 5010 DEF (Round 86). Deactivate, void-not-delete. Repoint
        expense_category_account_map def -> the DEF ITEM -> 5000. Do NOT repost 5010's live
        postings; they are transaction rows and the purge deletes them.
 2. REVERSE 5160 / 5170 in feeder-input-02-settlement-expense-extract.py (Round 83). Reefer and
        washout are ITEMS. ACCOUNT_KEY becomes ITEM_KEY: a category resolves to an ITEM, the item
        carries the account. Same for company_vehicle_fuel and driver_reimbursement.
 3. E13-B CHART HYGIENE.
        D1 flat COGS block: 5000, 5005, 5100, 5300, 5400, 5500, 5700, 6150, 6155, 6160, 6165,
           6170, 6175 all have parent_account_id NULL. 5400 Truck R&M master (non-postable),
           NEW 5450 Trailer R&M master (non-postable), 5500/6160/6150 under the right master,
           5005 under 5000. NO DEF ACCOUNT, NO REEFER ACCOUNT.
        D2 remove test accounts: 2100-00-039 and DRIVERCASHAD896665-045 (TEST
           Autoprovisionwalk-void); 2100-00-037 and -043 ("Safety —").
        D3 duplicate drivers (Samsara multi-user): Leonel Antonio Morales Noguez 2100-00-003 vs
           Leonel Antonio Morales 2100-00-040; Carlos Mauricio Carvallo -034 vs Carlos Mauricio
           Pena Carvallo -041, and the same pairs on the cash-advance side. Repoint the writer,
           never drag the FK. Report EVERY pair.
        D4 renumber the autogenerated strings — APPROVED, do not wait: DRIVERCASHAD896665,
           DRIVERRECOVE488409, DRIVERTRIPLU056412, OFFICEEXPENS815299, QBO-228-USMCA,
           TMS-INC-DRIVER-ABANDON. Kill the OFFICEEXPENS815299 / 6210 duplicate.
        D5 strip "(hired unknown)" from 30 account names. Cursor's M1 proved this creates no
           duplicate.
 4. ITEM CATALOG SEED — 137 items, 20+ categories.
        126 from 03-SOURCE-DOCUMENTS/09-22-2026-QBO-LIVE-ITEM-CATALOG-126.csv (live QBO file)
        +5 Round 87: Sales-Tracking/MacroPoint Compliance · Sales-On-Time Pickup Appointment ·
           Sales-On-Time Delivery Appointment · Sales-Tarp Charge ·
           Driver Deduction-Company Vehicle Use Fee (posts to INCOME)
        +6 Round 88 driver deductions, each mirroring a 49xx reason:
           Missing or Late Paperwork/POD (4920) · Lumper Not Paid or Receipt Missing (4920/4930) ·
           Cargo Damage OS&D (4930) · Detention Denied - Driver Delay (4950) ·
           Missed Appointment (4910) · Load Not Tarped or Secured (4980)
        Delete the 5 test items: CC2-BATTERY-20260807, P42-VFK-ITEM-0811, TESTCC3-MAINT-20260825,
        ZZ-GATEB-A, ZZ-GATEB-B. Keep and map the 3 Relay items.
        An item with no account: STOP AND REPORT. Never invent an account.
 5. HONDA FEE SIGN. The four 10.00 lines appear POSITIVE in the company document's expense block.
        As a charge to the driver they should reduce his net and credit income. Confirm against
        ONE source settlement PDF showing the driver's net. Do not assume either direction.
 6. ESCROW WRITER: sign follows transaction_type, and ALL 80 escrow lines feed (20 never did).
        PR #22312 is open on this.
 7. NO DEF EXPENSE ROW FROM ANY PATH. 8. Finish E15/E16 extract.
 9. E19 test-data sweep (units, drivers) — 14 TEST/DEMO units and 8 test drivers found, zero
        financial rows attached. E20 Samsara driver identity map.

## CURSOR  (guards, invariants, reconciler)
 1. E7 BATCH 2 — IN PROGRESS. 154 allowlisted guards; 118 share one skip shape and convert
        mechanically; 36 need individual handling; 45 always-run go DB-conditional.
        The 18 red carry PROVISIONAL ceilings per Round 86.
 2. I-DEDUCT invariant (Round 88), after batch 2. Both directions: every customer deduction with
        fault='us-driver' has a driver recovery; every driver deduction has an
        originating_deduction_id. It finds ZERO today — that is the point, it is armed before the
        first deduction lands. Its baseline is NOT provisional; the purge recreates the
        relationship rather than deleting it.
 3. The rest of the reconciler — repair calls, the exception table, the cron, the owner's screen
        — waits for the purge. The backend half is CC-1's per the ruling's build order.
 4. RETRACTED, DO NOT BUILD: M2 (counting money lines stored amount-only). Those rows die in the
        purge. My error, Round 85.

## LEAD (me)
 1. LINE HAUL VARIANCE 6,720.00 — feed_input.json 429,695.00 vs cost control 436,415.00.
        NOT EXPLAINED. Accessorials are the likely cause. NOTHING FEEDS UNTIL THIS CLOSES.
 2. Re-read the 15 gap lines whose description was lost in parsing (feed_input_gaps.json).
 3. The 4 rate confirmations with no charge block: loads_5601763, 5606017, 5606138, 5647973.
 4. Day-1 dry run on 2026-08-10 (loads 13510, 13508) — STOOD DOWN until the engines land. It is
        the acceptance test, not a thing to run against unbuilt engines.
 5. Keep this folder current. It is what survives the session.

## DONE THIS SESSION — with proof
 CURSOR  E1 posting-source writer + 16 callers #22293 · E17 reconciler + I8 #22309 (LIVE,
         git_sha 72b3e367af) · E7 batch 1 #22310 · I2 #22313 (22 exceptions, 82,587.00) ·
         M1 duplicate-account-name guard #22315 (152 accounts, 152 distinct names, 0 collisions)
         · scoreboard regen that unblocked every seat's push (86 commits vs a limit of 80)
 CC-1    ACCT-F61 historical_backfill delivery-evidence gate #22285 · reconciliation-constants
         guard · E14 schema, 9 columns live on production
 CC-2    Faro fee mapping #22287 · E8 + E11-D3 built and proven
 CC-3    account_key mapping #22289 · settlement parser hardening #22283 · 3 held branches landed
 LEAD    parse_settlements.py · build_feed_input.py (124 loads, 1,165 item lines, exit 0) ·
         parse_rate_confirmations.py (15 of 19, all tie) · measure_faro_shortpay.py (funding
         identity holds 82 of 82) · build_day_control.py · build_settlement_control.py ·
         verify-feed-day.mjs · verify-feed-load.mjs · purge SQL corrected (3 missing tables)
