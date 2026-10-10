# 2026-10-10 LEAD TO SEATS

**CC-1 — ROUND 443.1 — posted 2:55 PM CT (19:55 UTC)**

```
CC-1 — ROUND 443.1 — INVOICE SERVICE: OWNER-AUTHORIZED $0 INVOICE (accounting/** only)
Issued 2026-10-10 2:50 PM CT (19:50 UTC) by Claude Lead. USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80).
Measured on main 745714fe5dd815444f7ec15935fff5ae3e16ae6d and on Neon br-fancy-credit-akjnd07a under bypass_rls='lucia'.

OWNER RULING THIS SERVES (2026-10-02, restated 2026-10-10):
A mixed settlement keeps its Transportation load with the invoice at $0.00 so the expenses stay
attributable, and USMCA keeps the expenses. Today: "they belong to transportation, but i want the
invoice for 0 dollars."

MEASURED DEFECT
1. apps/backend/src/accounting/from-load.ts:182-189 — buildInvoiceFromLoad throws load_has_no_rate
   whenever rate_total_cents <= 0. There is no way to mint the owner's $0 invoice.
2. from-load.ts line insert (VALUES ... ,1,$7,$7,0) writes quantity 1, unit_amount_cents = line total.
   Live constraint accounting.invoice_lines: invoice_lines_quantity_check CHECK (quantity > 0).
   So the $0 line is quantity 1 x 0 cents. Quantity 0 can never be stored. Do not change the constraint.
3. Live header constraints already allow it: invoices_total_cents_check CHECK (total_cents >= 0),
   invoices_subtotal_cents_check CHECK (subtotal_cents >= 0).
4. accounting/revrec-delivery-posting/poster.service.ts:561 returns gate zero_amount when amount <= 0.
   Correct: a $0 invoice posts no revenue and no receivable. Keep it.

REQUIRED CHANGE — ONE PR
a. BuildInvoiceInput gains one optional flag: authorizedZeroRevenue?: boolean (default false).
   When false: behaviour at :182-189 is unchanged, byte for byte. Missing rate still refuses.
   When true AND rate_total_cents === 0: mint the invoice. Header subtotal_cents 0, total_cents 0,
   amount_open_cents 0. One linehaul line: quantity 1, unit_amount_cents 0, line_total_cents 0,
   the Freight / Line-haul Income account from resolveInvoiceLineRevenueAccountId (same resolver).
   When true AND rate_total_cents > 0: refuse with code zero_revenue_flag_on_rated_load.
b. sendDraftInvoice (accounting/invoice-send.service.ts): a $0 invoice sends, is stamped sent_at /
   issue_date / due_date exactly as any invoice, and writes NO journal entry, NO receivable, NO revrec
   latch entry. It must not throw and must not report a posting failure. Return an explicit reason
   zero_revenue_no_posting.
c. A $0 invoice is never eligible for factoring: wherever the factor-submit path reads an invoice
   (autoSubmitDeliveredLoadToFactor and bulk mark-factored), total_cents = 0 is a refusal named
   zero_revenue_invoice_not_factorable. factoring_status stays not_factored.
d. requestedDisplayId already exists on BuildInvoiceInput and resolveInvoiceDisplayId
   (accounting/display-id.ts:283) already honours a typed number and raises
   DuplicateDocumentNumberError. Do not change it. CC-3 will pass it in ROUND 443.2.

LANE BOUNDARY
Touch apps/backend/src/accounting/** only. Do NOT touch driver-finance/**, dispatch/**, banking/**.
Do NOT relax load_has_no_rate for any caller that does not pass the flag.
Do NOT touch TRANSPORTATION or TRUCKING — never read, write, count or report on them.
NOBODY SEEDS DATA. No invoice, load or any row is written to USMCA production, not for proof.
Prove on unit tests and on a throwaway Neon branch you delete-request to the owner afterwards.

ONE GUARD, SAME PR
scripts/verify-steps/verify-zero-revenue-invoice-authorized-only.mjs (numbered per folder convention), with --selftest.
It asserts on source: (1) from-load.ts still throws load_has_no_rate when the flag is absent;
(2) the zero branch is reachable only when authorizedZeroRevenue === true; (3) the zero line is
written quantity 1, unit_amount_cents 0; (4) the factor-submit path refuses total_cents = 0.

FAST-MERGE ORDER (law doc section 7): Gate exit 0 -> Push -> PR -> Merge -> Neon (step 5, after merge) -> Next.
No migration is expected in this round. If you find you need one, STOP and post why.

DEADLINE: 2026-10-10 22:00 UTC (5:00 PM CT).
SURRENDER: if missed or silent, CC-3 takes from-load.ts zero path under
SURFACE-BREACH-AUTHORIZED and CC-1 keeps the rest of accounting. Blocked = quote the blocker and name
who unblocks it, in writing, before the deadline.

DONE LINE (re-measurable, Lead re-measures before marking done):
CC-1 | 443.1 DONE | <merge sha> | <live backend sha> | flag absent + rate 0 -> load_has_no_rate (test name) |
flag true + rate 0 -> invoice total_cents 0, 1 line qty 1 unit 0, 0 journal entries (test name) |
factor submit on total 0 -> zero_revenue_invoice_not_factorable (test name) | guard PASS + selftest | NEXT none
```

**CC-3 — ROUND 443.2 to 443.7 — posted 2:55 PM CT (19:55 UTC)**

```
CC-3 — ROUND 443.2 to 443.7 — SETTLEMENT CREATOR ENGINE: PERMANENT FIX (driver-finance/** + Creator frontend)
Issued 2026-10-10 2:50 PM CT (19:50 UTC) by Claude Lead. USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80).
Measured on main 745714fe5dd815444f7ec15935fff5ae3e16ae6d and on Neon br-fancy-credit-akjnd07a under bypass_rls='lucia'.
Owner today: "i need all engines fixed permanently ... once permanently and perfectly fixed, we seed the
first 10 settlements to confirm they are created correctly."

LIVE STATE YOU START FROM (measured 2:20 PM CT): USMCA loads 0, invoices 0, bills 0, driver bills 0,
driver settlements 0, fuel transactions 0, expenses 5 (bank fees, $203.14), journal entries 280
(229 bank categorization, 46 bank deposit, 5 expense). The owner enters the settlements himself.

RULES FOR EVERY STEP
- One PR + one named guard per step, guard wired in scripts/verify-steps/ in the same PR, with --selftest.
- NOBODY SEEDS DATA. No load, invoice, bill, expense, settlement or any row is written to USMCA
  production, not for proof. Prove on unit tests and a throwaway Neon branch.
- TRANSPORTATION and TRUCKING are frozen: never read, write, count or report on them.
- Use existing engines. No second calculator, no raw INSERT where a service exists, no journal entry
  written by hand. A step that needs a rule the owner has not given: STOP and post the question.
- FAST-MERGE ORDER (law doc section 7): Gate exit 0 -> Push -> PR -> Merge -> Neon (step 5, after merge) -> Next.
- Finish each step before starting the next. Files: apps/backend/src/driver-finance/** and
  apps/frontend/src/pages/settlements/** + apps/frontend/src/api/settlementCreator.ts.
  Do NOT touch accounting/** (CC-1), dispatch/** (CC-2), banking/** (Cursor).

==== STEP 443.2 — QUICK PAY NEVER RENDERS ON A FACTORED LOAD — deadline 21:00 UTC ====
Owner today: "there is no quickpay that should render if confirmed those are factored."
MEASURED: apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx:1285-1291 computes
quickPayExpenseCents = 0.50% x (invoice + accessorials) ONLY for loads where factoring is faro_usmca or
faro_transportation. That is the exact inverse of the rule. Rendered at :2449-2455 (sc-quickpay-expense)
and :3118 (TotalRow "QuickPay expense"). No backend code computes quick pay (grep: 0 hits).
REQUIRED: a load with factoring faro_usmca or faro_transportation contributes 0 to quick pay and the
0.50% formula is deleted. When every load in the settlement is factored, the QuickPay field and the
TotalRow do not render. Nothing replaces the formula: no percentage is assumed for a direct load.
The amount for a direct load where the customer paid and charged quick pay is an OPEN OWNER QUESTION
(where the charged amount comes from) — do not build it, do not guess it.
GUARD: verify-settlement-creator-no-quickpay-on-factored.mjs — asserts no "0.005" / quick-pay percentage
literal in the drawer and that a factored-only settlement renders no sc-quickpay-expense node.
DONE: CC-3 | 443.2 DONE | <sha> | <live FE sha> | factored-only draft: sc-quickpay-expense count 0, Control totals
has no QuickPay row | guard PASS + selftest | NEXT 443.3

==== STEP 443.3 — INVOICE NUMBER BOX + $0 TRANSPORTATION INVOICE — deadline 23:30 UTC (needs CC-1 443.1 merged) ====
Owner today: "we need to input in our app the invoice numbers for these loads that we presented to faro
and those in quickbooks that were not purchased. then we continue loads as invoice numbers."
Law doc section 5: every transaction creator has an empty, editable number box; typed value wins
verbatim; blank means the system assigns.
MEASURED:
- settlement-creator.routes.ts draftSchema loads[] has NO invoice number field; the Creator calls
  buildInvoiceFromLoad at settlement-creator.service.ts:1603 with loadId only, so every invoice is forced
  to the load number. The owner's Faro/QuickBooks invoice numbers for USMCA run 1 to 118
  (example: load 13511 = invoice 1, load 13510 = invoice 2, load 13508 = invoice 3).
- accounting BuildInvoiceInput.requestedDisplayId and resolveInvoiceDisplayId already support a typed
  number, and invoices_display_id_check already accepts ^[0-9]{1,12}$.
  invoices_operating_company_id_display_id_key is UNIQUE (operating_company_id, display_id).
- settlement-creator.service.ts:1606-1609 converts load_has_no_rate into "cannot mint invoice — rate is $0".
- driver-finance/feed-gate/feed-gate.checks.ts:181 fails an invoice with "total is zero"; :188 fails a
  line with "zero line"; :68 demands a posted A/R journal entry for any sent invoice.
REQUIRED:
a. loads[] gains invoice_number (string, digits, optional). One "Invoice no." box on the load block, empty
   and editable. Typed -> passed as requestedDisplayId. Blank -> the load number (existing fallback).
   A duplicate refuses the whole post naming the number and the load; nothing is written.
b. A load with factoring = faro_transportation AND line haul amount 0 is the owner-authorized $0 invoice.
   The Creator passes authorizedZeroRevenue: true for that load and only that load. Any other load at $0
   still refuses with the existing message. The load, its stops, driver bill, fuel, expenses and
   deductions are all created as normal — only customer revenue is zero.
c. A settlement where EVERY load is faro_transportation is refused: code full_transportation_settlement,
   message "Every load in this settlement is Transportation — it is not entered in USMCA." (owner
   2026-10-02: a full Transportation settlement keeps no record in the app).
d. feed-gate.checks.ts: the three checks above pass for the authorized case only — an invoice whose load
   is faro_transportation, total_cents 0, one line quantity 1 unit 0, zero journal entries. For every
   other invoice the checks are unchanged.
e. The post-commit factor auto-submit (settlement-creator.routes.ts:265+) already skips
   faro_transportation. Keep that; add no submit for a $0 invoice.
GUARD: verify-settlement-creator-invoice-number-and-zero-invoice.mjs
DONE: CC-3 | 443.3 DONE | <sha> | <live sha> | typed 3 on load 13508 -> invoice display_id 3 (test) | blank ->
display_id = load number (test) | duplicate -> refused, 0 rows written (test) | faro_transportation + $0 ->
invoice total_cents 0, 1 line qty 1, 0 journal entries, feed gate PASS (test) | direct + $0 -> refused (test) |
all-Transportation settlement -> full_transportation_settlement (test) | guard PASS + selftest | NEXT 443.4

==== STEP 443.4 — CUSTOMER REVENUE NEVER ENTERS DRIVER PAY — deadline 2026-10-11 01:30 UTC ====
MEASURED:
- settlement-creator.service.ts:1496-1500 — earningsCents = line_haul_amount_cents (the field the drawer
  labels "Invoice Amt", SettlementCreatorDrawer.tsx:1902) falling back to rate x miles, PLUS customer
  accessorials. A customer invoice amount becomes a driver earnings line. With the $0 invoice this would
  also pay the driver $0 on a Transportation load whose driver pay must stay.
- :1510 and :1558 hardcode the items "Driver Pay-CDL-Loaded Miles" / "Driver Pay-CDL-Empty Miles".
  The owner's settlements for B1 drivers map to "Driver Pay-Mexico-B1 Driver-Loaded Miles" /
  "-Empty Miles" (Driver Pay / Settlements account).
REQUIRED:
a. Driver earnings = pay rate x short miles (loaded line) + empty rate x empty miles (empty line), two
   lines always. line_haul_amount_cents and customer accessorials are never read by the earnings
   calculation. The invoice amount feeds the invoice only.
b. The pay item comes from the driver's pay type on the pay card (getDriverPayCard, already used for the
   rate in #26159), never from a string literal. If the pay card cannot name the item, refuse with
   driver_pay_item_unresolved naming the driver — and post that as a blocker, do not default.
c. Every delivered load of a per-mile driver ends with exactly one driver bill, priced, linked to its load
   and to the final settlement. A salaried driver (owner 2026-09-28: Rafael, weekly salary) has no
   per-load bill and that is correct — the check reads the pay basis first.
GUARD: verify-settlement-creator-driver-pay-independent-of-invoice.mjs — asserts line_haul_amount_cents and
accessorials do not appear in the earnings expression and no "Driver Pay-CDL-" literal remains.
DONE: CC-3 | 443.4 DONE | <sha> | <live sha> | settlement 5769 shape: invoice 13498 $0.00, driver bill 13498
$568.76 (1,263.9 mi x $0.45), driver bill 13508 $586.76 ($577.80 + $8.96), gross $1,155.52 (test) |
guard PASS + selftest | NEXT 443.5

==== STEP 443.5 — EVERY DEDUCTION, ADMIN FEE AND FUEL LINE CARRIES ITS LOAD — deadline 2026-10-11 03:30 UTC ====
Source comment at settlement-creator.service.ts:1382 — "Owner rule 2026-10-02: every settlement item
belongs to a load."
MEASURED:
- :1435-1453 applyDeduction calls createSettlementDeduction with no loadId, although the deduction line
  carries load_number and deductions.service.ts:68 accepts loadId. Every deduction is settlement-only.
- :1463-1470 admin_fee_cents is one settlement-level amount, no load.
- :1818-1832 resolveLineLoadId returns null when a fuel or expense line has no load; fuel is then written
  with a load exemption reason instead of being attributed.
REQUIRED:
a. Deductions: resolve load_number and pass loadId. Missing or unknown load -> refuse with
   deduction_load_required naming the line. No settlement-only deduction.
b. Admin fee: entered as a deduction line with its load, through the same path. The separate
   admin_fee_cents amount is refused when a deduction line already carries the same charge (no double entry).
c. Fuel with no load typed: attribute by purchase date against THIS settlement's loads (pickup date to
   delivery date, both in the draft). Exactly one load matches -> assign it. None or more than one ->
   refuse with fuel_load_ambiguous naming the fill, the date and the candidate loads. Never the first load.
d. Escrow first-load fallback at :1383 is NOT changed in this step — owner ruling pending.
GUARD: verify-settlement-creator-every-line-has-load.mjs
DONE: CC-3 | 443.5 DONE | <sha> | <live sha> | 5769 shape: escrow $25 -> 13498, escrow $25 -> 13508, admin fee
$10 -> 13508, diesel 08/06 $503.67 and 08/07 $774.55 -> 13508, net $1,095.52 (test) | deduction with no load ->
refused (test) | fuel matching 2 loads -> refused (test) | guard PASS + selftest | NEXT 443.6

==== STEP 443.6 — COMPANY EXPENSE: REAL PAYMENT SOURCE, FULL STAMP, BILL WHEN OWED — deadline 2026-10-11 06:00 UTC ====
Owner today: "create bills, bill expenses stamp."
Law doc section 3: paid now = DR expense CR bank/card; owed = DR expense CR Accounts Payable, cleared by a
bill payment. A record with no payment account and no vendor is an orphan.
MEASURED (settlement-creator.service.ts):
- :1254 const card = exp.card ?? "relay" — a missing payment source silently credits the Relay fuel wallet.
- :1274-1292 raw INSERT INTO accounting.expenses with no vendor, no unit, no trailer, no
  vendor_document_number. :1298-1302 line written quantity 1, rate = whole amount, unit 'each'.
- resolveExpenseLineAccount (:1846) falls back to other operating expense with a null item.
- :1326-1328 swallows EXPENSE_POST_GL_REFUSED / "not posting-eligible" / FLAG: the document is created,
  its ledger posting is not, and the post still reports success.
REQUIRED:
a. Payment source is required on every company expense: relay, dreamline, or owed to vendor. No default.
   Missing -> refuse with expense_payment_source_required naming the line.
b. Owed to vendor -> a BILL through the existing bill service (Accounts Payable), numbered per law doc
   section 5, never an expense crediting a card.
c. Every expense and bill carries vendor, load, driver, unit, trailer (when the load has one), and the
   vendor's own document number (the settlement's INVOICE column, e.g. 2870483) in
   vendor_document_number. Created through the expense / bill service, not a raw INSERT.
d. Quantity, unit of measure and rate are preserved when the source has them (gallons for DEF);
   quantity 1 only for a flat charge.
e. Item or account unresolved -> refuse with expense_item_unresolved naming the line. No fallback account.
f. A posting refusal fails the whole post. Nothing is committed with a document and no ledger entry.
GUARD: verify-settlement-creator-expense-stamped-and-sourced.mjs
DONE: CC-3 | 443.6 DONE | <sha> | <live sha> | 5769 DEF $67.84: vendor Loves, vendor_document_number 2870483,
load 13508, driver, unit T156, trailer 538306, payment source as entered, 1 posted journal entry (test) |
no payment source -> refused (test) | owed -> bill in Accounts Payable, 0 expenses (test) | forced posting
refusal -> 0 rows committed (test) | guard PASS + selftest | NEXT 443.7

==== STEP 443.7 — ONE POST, ALL OR NOTHING, AND AN HONEST RESULT — deadline 2026-10-11 08:30 UTC ====
MEASURED (settlement-creator.routes.ts):
- :247-255 ensureDispatchedLoadsForCreator books the loads in its OWN transaction, committed before
  postSettlementCreatorInClientTx (:257-263) starts. If the settlement post then refuses, the loads stay.
- settlement-creator-seed-loads.ts:206-212 then refuses the retry with load_already_exists. The owner is
  stuck with stranded loads he cannot re-enter.
- :265+ factor auto-submit and billing sync run after commit; failures are logged and the route still
  returns ok: true.
REQUIRED:
a. Loads, driver bills, invoices, fuel, expenses, bills, deductions, escrow, settlement and its close are
   one transaction. Any refusal leaves ZERO rows. A retry of the same draft succeeds.
b. The response reports each stage separately — documents, ledger, factoring submit, billing sync — each
   ok or failed with its reason. ok: true only when every required stage succeeded. A failed after-commit
   stage is stored and retryable, and shown on screen in plain English.
GUARD: verify-settlement-creator-atomic-post.mjs
DONE: CC-3 | 443.7 DONE | <sha> | <live sha> | forced refusal at close -> loads 0, invoices 0, driver bills 0,
expenses 0, settlements 0 on the test branch; same draft re-posted -> succeeds (test) | forced factor-submit
failure -> response factoring: failed + reason, ok false (test) | guard PASS + selftest | NEXT none — report to Lead

SURRENDER: silence past any deadline = surrender of the remaining steps to Cursor (today's Creator PR
#26159 shipped under "LANE: Cursor / settlements"). CC-3 keeps safety, drivers and telematics.
Blocked = quote the blocker and name who unblocks it, in writing, before the deadline.

ACCEPTANCE AFTER 443.7 (the owner enters these himself, nobody else): settlements 5769, 5771, 5772, 5773,
5774, 5775, 5776, 5777, 5778, 5779. The Lead re-measures every row on Neon after each one.
```

**CC-1 — ROUND 443.8 + HOLD ON 443.1 — posted 2:37 PM CT (19:37 UTC)**

```
CC-1 — ROUND 443.8 — INVOICE NUMBER FORMAT "INVOICE-LOAD" + HOLD ON 443.1
Owner 2026-10-10 2:36 PM CT: "we add the invoice number and then the load number ... for example invoice
100-10001 for invoice and load number in the same one, so we do not get confused."

HOLD: ROUND 443.1 (bash invoice) is ON HOLD until the Lead posts the owner's ruling on Transportation loads.
Do not merge it. Start 443.8 now.

MEASURED
- apps/backend/src/accounting/display-id.ts:34-35 INVOICE_DISPLAY_ID_PATTERN accepts INV-YYYY-NNNNN,
  L-NNNNNNNN-NNNN, LUSMCAFREIGHT-NNNNNNNN-NNNN and 1 to 12 digits. "3-13508" matches none.
- Live constraint accounting.invoices invoices_display_id_check has the same four alternatives. "3-13508"
  is refused by the database.
REQUIRED — ONE PR
- Add one alternative to both: ^[0-9]{1,6}-[0-9]{1,12}$ (invoice number, dash, load number).
  Existing alternatives unchanged. Migration idempotent, applied by you after merge (step 5).
- resolveInvoiceDisplayId: a typed "3-13508" is honoured verbatim; a duplicate still raises
  DuplicateDocumentNumberError. Blank still falls back to the load number.
LANE: accounting/** and one migration only. USMCA only. NOBODY SEEDS DATA.
GUARD: verify-invoice-display-id-accepts-invoice-dash-load.mjs + --selftest (asserts code pattern and the
live constraint definition both accept 3-13508 and 59-13577, and both refuse 3-, -13508, 3-13508-1).
FAST-MERGE: Gate exit 0 -> Push -> PR -> Merge -> Neon (step 5) -> Next.
DEADLINE: 2026-10-10 22:30 UTC. SURRENDER: CC-3 under SURFACE-BREACH-AUTHORIZED.
DONE: CC-1 | 443.8 DONE | <sha> | <live sha> | pg_get_constraintdef(invoices_display_id_check) pasted, contains
the new alternative | 3-13508 accepted, 3- refused (test) | guard PASS + selftest | NEXT 443.1 on Lead's word
```

**CC-3 — AMENDMENT TO ROUND 443.2 / 443.3 / 443.5 — posted 2:37 PM CT (19:37 UTC)**

```
CC-3 — AMENDMENT TO ROUND 443.2, 443.3, 443.5 (owner rulings 2026-10-10 2:36 PM CT)

443.2 CHANGED — owner: "there is no quickpay do not worry."
Quick pay does not exist in the Settlement Creator. Delete quickPayExpenseCents
(SettlementCreatorDrawer.tsx:1285-1291), the QuickPay field (:2449-2455) and the TotalRow (:3118).
Nothing replaces them, for factored or direct loads. Guard asserts 0 occurrences of "quick" (any case)
in the drawer. Deadline unchanged: 21:00 UTC.

443.3 part a CHANGED — owner: "we add the invoice number and then the load number ... invoice 100-10001."
The "Invoice no." box takes the invoice number the owner presented to Faro / has in QuickBooks.
When typed, the invoice display_id is <invoice number>-<load number>, e.g. 3 on load 13508 -> 3-13508,
59 on loads 13577 and 13578 -> 59-13577 and 59-13578. Blank -> the load number alone, as today.
Needs CC-1 ROUND 443.8 merged (pattern + constraint). Deadline unchanged: 23:30 UTC.

443.3 parts b, c, d, e (the $0 Transportation invoice) — ON HOLD until the Lead posts the owner's ruling.
Build part a only. In 443.4 ignore the sentence about the $0 Transportation load; the rest stands.

443.5 part d CONFIRMED — owner: "escrow with no load number yes as you said."
Escrow with no load number goes to the settlement's first load (:1383). Leave it exactly as it is.

DONE lines: same format; 443.2 measures "quick" count 0; 443.3 measures 3-13508, 59-13577, 59-13578, blank.
```

**CC-1 — HOLD LIFTED ON ROUND 443.1 — posted 2:56 PM CT (19:56 UTC)**

```
CC-1 — HOLD LIFTED — ROUND 443.1 ($0 INVOICE) IS LIVE AGAIN
Owner 2026-10-10 2:56 PM CT: "Yes I want them invoices in usmca for 0 dollars, so we can have control of
the loads and settlements."
Build ROUND 443.1 exactly as written. Nothing in it changed.
Order: 443.8 first (deadline 22:30 UTC unchanged), then 443.1.
NEW DEADLINE for 443.1: 2026-10-10 23:15 UTC (moved for the 20-minute hold). Surrender rule unchanged.
DONE lines unchanged.
```

**CC-3 — HOLD LIFTED ON ROUND 443.3 b–e — posted 2:56 PM CT (19:56 UTC)**

```
CC-3 — HOLD LIFTED — ROUND 443.3 PARTS b, c, d, e ($0 TRANSPORTATION INVOICE) ARE LIVE AGAIN
Owner 2026-10-10 2:56 PM CT: "Yes I want them invoices in usmca for 0 dollars, so we can have control of
the loads and settlements."
Build 443.3 parts b, c, d, e exactly as written in the original order, together with amended part a
(invoice display_id = <invoice number>-<load number>).
A $0 Transportation load with the Invoice no. box blank takes its load number alone, like any load.
The 443.4 sentence about the $0 Transportation load stands again: its driver pay is paid in full.
Needs CC-1 443.8 and 443.1 merged.
NEW DEADLINE for 443.3: 2026-10-11 00:30 UTC. Later steps each move one hour:
443.4 02:30 UTC, 443.5 04:30 UTC, 443.6 07:00 UTC, 443.7 09:30 UTC. 443.2 stays 21:00 UTC today.
Surrender rule and DONE lines unchanged.
```

**CC-1 — ROUND 443.8 REPLACED: EVERY INVOICE IS NUMBERED INVOICE-LOAD — posted 2:58 PM CT (19:58 UTC)**

```
CC-1 — ROUND 443.8 (REPLACES THE EARLIER 443.8) — EVERY INVOICE IS "<INVOICE NUMBER>-<LOAD NUMBER>"
Owner 2026-10-10 2:57 PM CT: "All the invoices that are seeded should have the invoice number and then
load number find a solution." Earlier today: "invoice 100-10001 for invoice and load number in the same
one, so we do not get confused" and "then we continue loads as invoice numbers."

MEASURED (main 745714fe, Neon prod under bypass, USMCA)
- accounting/display-id.ts:34-35 INVOICE_DISPLAY_ID_PATTERN and live invoices_display_id_check accept
  INV-YYYY-NNNNN, L-NNNNNNNN-NNNN, LUSMCAFREIGHT-NNNNNNNN-NNNN, 1-12 digits. "3-13508" is refused by both.
- display-id.ts:283 resolveInvoiceDisplayId: typed number wins verbatim; blank falls back to the load
  number alone (from-load.ts passes loadNumber as autoFallback). So a blank invoice is "13508", not N-load.
- invoices_operating_company_id_display_id_key is UNIQUE (operating_company_id, display_id).
- USMCA invoices today: 0 rows. The owner's Faro / QuickBooks numbers for USMCA run 1 to 118 through
  09-30, and 59 and 105 are each on two loads (59: 13577, 13578 · 105: 13627, 13624).

REQUIRED — ONE PR
a. Pattern: add ^[0-9]{1,6}-[0-9]{1,12}$ to INVOICE_DISPLAY_ID_PATTERN and to invoices_display_id_check
   (idempotent migration, you apply it at step 5). Existing alternatives stay so no old row breaks.
b. Every from-load invoice gets display_id = <invoice number>-<load number>. One rule, in
   resolveInvoiceDisplayId / buildInvoiceFromLoad, for every caller (Creator, proforma at pickup, drawer):
   - Invoice number TYPED (requestedDisplayId = digits) -> <typed>-<load number>. Example 3 -> 3-13508.
     The same typed number on a different load is allowed (59-13577 and 59-13578 are both real).
     The same typed number on the same load -> DuplicateDocumentNumberError, as today.
   - BLANK on an authorized $0 invoice (authorizedZeroRevenue true, ROUND 443.1) -> 0-<load number>.
     Example 0-13498. A $0 Transportation invoice never takes a USMCA invoice number.
   - BLANK on any other load -> <next>-<load number>, next = highest invoice number already used by this
     company (the digits before the dash, 0 excluded) + 1; 1 when there is none. Allocated under the
     existing advisory lock (withDisplayLock) — same MAX()+1 pattern the other generators use.
c. The load number alone is no longer a valid from-load invoice number. Manual / recurring / TONU
   invoices keep the INV-YYYY-NNNNN allocator, unchanged.
LANE: accounting/** and one migration only. USMCA only. NOBODY SEEDS DATA — prove on tests and a
throwaway Neon branch. Do not touch driver-finance/** (CC-3 passes the typed number in 443.3).
GUARD: verify-invoice-number-is-invoice-dash-load.mjs + --selftest.
FAST-MERGE: Gate exit 0 -> Push -> PR -> Merge -> Neon (step 5) -> Next.
DEADLINE: 2026-10-10 23:00 UTC. Then 443.1, deadline 23:45 UTC. SURRENDER: CC-3 under SURFACE-BREACH-AUTHORIZED.
DONE: CC-1 | 443.8 DONE | <sha> | <live sha> | pg_get_constraintdef(invoices_display_id_check) pasted |
typed 3 on 13508 -> 3-13508 | typed 59 on 13577 and 13578 -> both accepted | blank after 118 -> 119-<load> |
blank $0 -> 0-13498 | blank with no invoices -> 1-<load> (tests named) | guard PASS + selftest | NEXT 443.1
```

**CC-3 — AMENDMENT TO ROUND 443.3 part a — posted 2:58 PM CT (19:58 UTC)**

```
CC-3 — AMENDMENT TO ROUND 443.3 PART a — THE CREATOR PASSES THE NUMBER, ACCOUNTING BUILDS "INVOICE-LOAD"
Owner 2026-10-10 2:57 PM CT: "All the invoices that are seeded should have the invoice number and then
load number."
The "Invoice no." box takes digits only (the number presented to Faro / in QuickBooks). Pass it as
requestedDisplayId. Do NOT build the dash format yourself and do NOT fall back to the load number:
CC-1 ROUND 443.8 makes the invoice service return <typed>-<load>, <next>-<load> when blank, and
0-<load> for the blank $0 Transportation invoice. The Creator preview shows the final number the
service will assign before the owner posts.
DONE line for 443.3 measures: typed 3 on 13508 -> 3-13508 · typed 59 on 13577 and 13578 -> 59-13577,
59-13578 · blank $0 Transportation 13498 -> 0-13498 · blank direct load -> <next>-<load>.
Deadline for 443.3 stays 2026-10-11 00:30 UTC.
```

**ALL SEATS — FAST-MERGE 4-MINUTE LOOP APPLIES TO EVERY 443.x STEP — posted 3:09 PM CT (20:09 UTC)**

```
CC-1 · CC-3 — FAST MERGE IS ON FOR ROUND 443. LAW: docs/bus/FAST-MERGE-4MIN-LAW.md
Owner 2026-10-10 3:07 PM CT: "remember they must follow fast merge law, fast 4 minute weekend merge method."
Every 443.x ship, no exceptions (the loop as written in the law file and ROUND 153.3):
1 Gate: node scripts/money-pr-local-gate.mjs -> exit 0 on your tip (tip contains origin/main).
2 Push. If it dies ONLY at verify-static-fallback ENV class (not your guard) -> git push --no-verify is authorized.
3 gh pr create.
4 Same 15 seconds: gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash.
  Never gh pr checks --watch, never wait on CI, never ask the owner, never leave your PR open.
5 Neon proof for money/migrations. One backend deploy trigger after merge, then healthz git_sha = your squash sha.
6 One line in your NOW file: <SEAT> | FAST-MERGE | gate=exit0 | merged #N @ <sha> | live=<healthz sha> | NEXT=<step>
You may NOT merge on a gate FAIL, or --no-verify past your own red.
Any seat that finishes a step another seat needs tells that seat by tmux line + NOW-file line. Nobody routes
through the owner. CC-1: the moment 443.8 is merged and live, tell cc3 so 443.3 part a can ship.
```

**CC-3 — ROUND 443.9 — PURGE REMNANTS: NOTHING FROM BEFORE THE PURGE STAYS — posted 3:09 PM CT (20:09 UTC)**

```
CC-3 — ROUND 443.9 — PURGE REMNANTS (run after 443.3, before 443.4)
Owner 2026-10-10: "there should be nothing from before that is why we deleted and purged" and
"delete anything related to the purge. Not any banking transactions."

MEASURED 3:10 PM CT, Neon br-fancy-credit-akjnd07a, bypass_rls='lucia', USMCA 5c854333-6ea5-4faa-af31-67cb272fef80
- mdata.loads 0 · accounting.invoices 0 · accounting.bills 0 · driver_finance.driver_bills 0 ·
  driver_finance.driver_settlements 0 · fuel.fuel_transactions 0.
- STILL THERE, ORPHANED: driver_finance.feed_intakes 2 rows (created 2026-10-01, subject_table
  accounting.invoices, subject_id dbf93c60-4911-49f1-b087-70a72bb8bdc5 and
  7858b5fd-5908-465e-a70d-7db83b5fc333 — neither invoice exists) and their 24 rows in
  driver_finance.feed_intake_checks. Both tables carry WORM delete-refusal triggers
  (trg_worm_refuse_delete, trg_feed_intake_checks_worm), which is why the purge left them.
- CANDIDATES, row counts measured, orphan status NOT yet measured — you measure each and paste the count:
  reports.lane_profitability_cache 2,891 · reports.deadhead_cache 22 · safety.fuel_gps_matches 85 ·
  pwa.driver_notifications 274 · fuel.tank_events 1 · docs.files 496 · mdata.load_stops (no company column).

DO NOT TOUCH — BANKING, the owner's work of 10-06 to 10-09: banking.* (bank_transactions 1,291,
reconciliation_matches 199), accounting.journal_entries 280 and their 560 postings, posting_batches 196,
transaction_source_links 726, outbox_events 173, accounting.deposits 23 / deposit_lines 23,
accounting.expenses 5 / expense_lines 5. Do not touch masters, catalogs, telematics, geofences, safety
records, maintenance, audit.*, or lib.trace_counters.

REQUIRED — ONE PR
a. The existing complete-delete / purge engine learns these tables, so a purge never again leaves a row
   whose load, invoice, settlement, driver bill or fuel transaction is gone. No ad-hoc SQL, no disabling a
   trigger by hand: the engine's own authorized path deletes them.
b. Run it once on production for USMCA. Delete ONLY rows whose parent document no longer exists. A row
   whose parent still exists stays.
c. Guard: verify-no-orphan-of-purged-documents.mjs + --selftest — for every table above, count of rows
   pointing at a missing load / invoice / settlement / driver bill / fuel transaction = 0.
FAST-MERGE loop applies. NOBODY SEEDS DATA. TRANSPORTATION and TRUCKING: never read, write or count.
DEADLINE: 2026-10-11 01:30 UTC. SURRENDER: CC-1.
DONE: CC-3 | 443.9 DONE | <sha> | <live sha> | before/after count per table pasted (feed_intakes 2 -> 0,
feed_intake_checks 24 -> 0, each candidate: orphans N -> 0, kept M) | banking counts unchanged: journal
entries 280, postings 560, bank_transactions 1,291, expenses 5 | guard PASS + selftest | NEXT 443.4
```

**CC-2 — ROUND 443.10 — DISPATCH GATE BLOCKS THE OWNER'S $0 TRANSPORTATION LOAD — posted 3:11 PM CT (20:11 UTC)**

```
CC-2 — ROUND 443.10 — bookLoad ZERO-DOLLAR DISPATCH GATE: ALLOW THE OWNER-AUTHORIZED $0 LOAD (dispatch/** only)
Owner 2026-10-10 2:56 PM CT: "Yes I want them invoices in usmca for 0 dollars, so we can have control of
the loads and settlements." USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80).

MEASURED on main 76004b2
- apps/backend/src/dispatch/book-load.service.ts:2820 throws
  E_LOAD_DISPATCHED_NO_CHARGE_LINES "Load N is dispatching with $0.00 in charge lines -- the customer would
  never be billed" for source live_feed (and for an undeclared source). historical_backfill records an
  exception and proceeds (comment block ending :1590).
- CC-3 reports (SEATS-TO-LEAD 20:1xZ, proved on a deleted prod fork): the Settlement Creator's bookLoad call
  is refused by this gate for the authorized $0 Transportation load, before the invoice step. CC-1 ROUND
  443.1 (merged de1b616, #26163) already lets the invoice service mint that $0 invoice.
REQUIRED — ONE PR
- BookLoadInput gains authorizedZeroRevenue?: boolean (default false). When true AND the charge-line total
  is 0: the gate at :2820 does not throw; it files the same audit exception row the historical_backfill
  case files, with gate=zero_dollar_charge_lines_at_dispatch and reason owner_authorized_zero_revenue.
  When false or absent: the gate is unchanged, byte for byte. When true AND total > 0: refuse with
  zero_revenue_flag_on_rated_load.
- No other gate in bookLoad changes. CC-3 passes the flag from the Creator only for a faro_transportation
  load at $0 (their 443.3 b).
LANE: apps/backend/src/dispatch/** only. NOBODY SEEDS DATA — prove on tests and a throwaway Neon branch.
TRANSPORTATION and TRUCKING: never read, write or count.
GUARD: verify-book-load-zero-dollar-gate-authorized-only.mjs + --selftest.
FAST-MERGE (docs/bus/FAST-MERGE-4MIN-LAW.md): gate exit 0 -> push -> PR -> squash-merge by API in the same
15 seconds -> Neon proof -> one NOW line. The moment it is merged and live, tell cc3 by tmux line.
DEADLINE: 2026-10-10 22:30 UTC. SURRENDER: CC-3 under SURFACE-BREACH-AUTHORIZED.
DONE: CC-2 | 443.10 DONE | <sha> | <live sha> | flag absent + $0 -> E_LOAD_DISPATCHED_NO_CHARGE_LINES (test) |
flag true + $0 -> load booked, 1 audit exception row reason owner_authorized_zero_revenue (test) |
flag true + rated -> refused (test) | guard PASS + selftest | NEXT none — tell cc3
```
