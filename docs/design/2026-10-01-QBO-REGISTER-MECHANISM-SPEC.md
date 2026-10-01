# QBO ACCOUNT REGISTER — MECHANISM SPEC (owner click-through, Lead recording, 2026-10-01)
Owner: "this is how the register for each account, expense, liability, bank should be like — functioning, connectivity etc."
Source: live QBO, USMCA Freight Solutions, Accounting > Chart of accounts > Bank Register (WF - General Operating 6103).
Target: IH35 Banking/Accounting registers — every account type gets ONE register screen with this exact behaviour.

## 1. HEADER (bank register)
- Breadcrumb: Accounting / Chart of accounts / Bank Register.
- Account selector (dropdown of all accounts of this type) — switching re-renders the same register.
- Bank Balance (feed-side balance, from the bank connection): -$190.81. ENDING BALANCE (book-side): $70,469.86.
  The two numbers sit side by side on purpose: bank truth vs book truth.
- "Reconciled through 01/31/2026" — the last closed reconciliation statement date.
- Buttons: [Bank transactions] (the feed / match screen), [Reconcile].
- Paging: "Go to: [1] of 21 · First Previous 1-100 of 2050 Next Last" — 100 rows per page, total count shown.
- Filter chip "All" (filter by reconcile status, type, date range, payee); print, export, gear (column chooser).

## 2. COLUMNS (two visual lines per row — this is the register shape)
Line 1: DATE | REF NO. | PAYEE | CLASS | PAYMENT | DEPOSIT | ✓ (reconcile status) | 📎 (attachment count) | BALANCE
Line 2: (blank) | TYPE | ACCOUNT (the split/offset account) | LOCATION | | | | |
- TYPE values seen: Expense, Deposit, Bill Payment, Credit Card Pmt (also Check, Transfer, Journal Entry, Sales Receipt, Payment…).
- ACCOUNT shows the full hierarchy path, e.g. "Repair & Maintenance Expenses:Truck & Reefer Washout Expense-(345.30)",
  "Operational Expenses:Shipping & Freight:Warehouse-Lumper Fee Expense", "Bank Charges & Fees-612:BC-NSF Fee",
  "Accounts Payable (A/P)" for a bill payment, "CL-CC:Amex Card-" for a credit-card payment, "WF - Payroll 6129" for a transfer.
- ✓ column is tri-state and blank/C/R only: blank = not matched, C = cleared (matched to bank feed), R = reconciled (locked by a closed reconciliation).
- 📎 shows the attachment count (1) when documents are attached.
- BALANCE shows a running balance ONLY when sorted by date; when sorted by any other column (here PAYEE) it reads "n/a".
- CLASS is used for the unit (T163, T147, 10224) — the truck is the class on every row that belongs to one.
- PAYMENT and DEPOSIT are separate columns (never a signed single amount).
- Sortable by any column header (PAYEE sort active in the capture).

## 3. ROW CLICK = INLINE EDIT (the mechanism)
Clicking a row expands it in place into an edit form with the SAME columns as editable fields:
- DATE (date picker), REF NO. (text), PAYEE (searchable dropdown), CLASS (dropdown), PAYMENT (amount), DEPOSIT (disabled when it's a payment), ✓ status (click toggles blank→C; R is locked), 📎 count.
- Second line: TYPE (read-only, "Expense"), ACCOUNT (searchable account dropdown), LOCATION (dropdown).
- ATTACHMENTS block: the attached files listed with size ("CamScanner 10-03-2026 13.52 (1).pdf (336.2 kb)") each with a remove ×; "Add Attachment" link.
- Buttons, right-aligned: [Delete] [Edit] [Cancel] [Save].
  - Save = commits the inline changes to the underlying document without leaving the register.
  - Edit = opens the ORIGINAL DOCUMENT (the Expense / Bill Payment / Deposit form itself) — full form, all lines.
  - Cancel = collapses without saving. Delete = deletes/voids the document (with confirmation).
- The row being edited keeps its place in the list; nothing re-sorts until Save.

## 4. CONNECTIVITY (every register row is a view of a real document)
- A register row is never its own record: it is one side of a posted document (expense, bill payment, deposit, transfer, check, JE line).
- Editing the row edits the document; opening Edit shows the document with its matched bank transaction and its attachments.
- The ✓ status is owned by the bank-feed match (C) and the reconciliation (R); the register only displays it and allows blank↔C by click.
- Reconciled (R) rows cannot change amount/date without a warning that the reconciliation will be off (QBO warns, then allows, and the reconcile report shows the change).

(continued as the owner clicks through: Edit → original document, matched bank row, unmatch, Reconcile screen with posting date + transaction date, expense register, liability register)

## 5. EDIT → THE ORIGINAL DOCUMENT (captured: Expense #13029, Blue Beacon Truck Wash, $43.50)
Opens as a full-screen document form over the register (register stays underneath; Close/Save returns to the same row).
- Title bar: "Expense #13029" · [Copy] [Give feedback] [⚙] [🖨] [✕]. AMOUNT shown large at top right ($43.50).
- "1 online banking match" banner at the top (collapsible) with a one-row table:
  DATE | TYPE | AMOUNT | BANK DETAIL (the bank's own description text, e.g. "PURCHASE AUTHORIZED ON 03/10 BLUE BEACON … LEBANON IN …") | MODE ("Manually matched" / "Auto-matched") | [Unmatch] button.
  → the document KNOWS its bank row; Unmatch is right there; this is what makes ✓=C on the register.
- Header fields (IH35 custom fields live here as first-class fields): Location · Settlement No · Truck No (T161) · Pick Up Date · Delivery Date · Bill Load No (13029) · Empty Miles · Loaded Miles · Work Order.
- CATEGORY DETAILS grid (account lines): # | CATEGORY | DESCRIPTION | AMOUNT | BILLABLE | CUSTOMER | PHASE | CLASS, with Add lines / Clear all lines and per-row copy/delete.
- ITEM DETAILS grid (product/service lines): # | PRODUCT/SERVICE ("Freight Delivery Costs:Reefer Tr…") | SKU | DESCRIPTION ("Reefer/Trailer Washout Expense") | QTY 1 | RATE 43.50 | AMOUNT $43.50 | BILLABLE | CUSTOMER | PHASE | CLASS 10224. Total $43.50.
- MEMO (free text: "03/10/2026 GASTO EN TARJETA … LOAD 13029 RUBEN PEDRO PEREZ GARCIA LAVADE DE REEFER 10224 / GASTO 43.50").
- ATTACHMENTS: file list with remove ×, "Add attachment", "Max file size 20MB".
- Footer: [Cancel] · [Make recurring] [More ▾] (Delete, Void, Transaction journal, Audit history) · [Save] [Save and close ▾].
- Items and accounts are BOTH on one expense: the item line carries the product/service (what was bought) and the class (unit); the GL posting comes from the item's account mapping. Owner law 09-22 "items vs accounts QBO clone" applies.

## 6. RECONCILE SCREEN (captured: WF 6103, statement ending May 31, 2026, in progress)
Header (the arithmetic is on screen, always):
- Account name · "Statement ending date: May 31, 2026" · [Edit info] [Save for later].
- STATEMENT ENDING BALANCE $25.00  −  CLEARED BALANCE $2,499.10  =  DIFFERENCE −$2,474.10 (orange ⚠ until $0.00).
- Under it the cleared balance's own derivation: BEGINNING BALANCE $4,901.81 − 617 PAYMENTS $855,359.53 + 447 DEPOSITS $852,956.82.
- Helper text: "Your selected transactions don't match your statement yet. When they match, you'll have a difference of $0.00."
  and "We select only the transactions that cleared your bank on or before the statement ending date. Unselected transactions are usually checks that haven't been cashed yet."
- Tabs: Payments | Deposits | All. Filter: "Statement ending date" (default), Clear filter / View all. Print table. Gear.

Grid columns (THE TWO DATES the owner asked for):
DATE ▲ | CLEARED DATE | TYPE | REF NO. | ACCOUNT | PAYEE | MEMO | PAYMENT (USD) | DEPOSIT (USD) | ● (cleared checkbox)
- DATE = the document's transaction/posting date (what we book). CLEARED DATE = the date the bank cleared it (from the matched bank row). Both shown side by side on every line; CLEARED DATE blank when unmatched (e.g. the payroll Journals: "Mixed up with bank accounts").
- ACCOUNT shows the offset account or "- Split -" when the document has several lines.
- MEMO carries the bank description or the user's memo (load number, truck, driver, "GASTO …").
- Clicking a row's circle toggles cleared for this reconciliation; the header totals (617 payments / 447 deposits / cleared balance / difference) recompute instantly.
- Clicking the row itself opens the document (same as register Edit) to fix date/amount/account; coming back recomputes.
- Journal rows (payroll JEs) can be cleared too — the reconcile works on GL lines against this account, not only on "transactions".
- Finish is only enabled at DIFFERENCE $0.00; otherwise "Save for later" keeps the partial state (checked rows persist as C).
- After Finish: every checked row becomes R, "Reconciled through <date>" updates in the register header, and a reconciliation report (beginning, cleared payments/deposits, ending, uncleared as of date) is stored and reopenable.

## 7. WHAT IH35 MUST MATCH (summary for the builders — one register component, one reconcile component)
1. Register per account (bank, credit card, A/P, A/R, expense, income, liability, equity): same two-line row shape, DATE/REF/PAYEE/CLASS/PAYMENT/DEPOSIT/✓/📎/BALANCE over TYPE/ACCOUNT/LOCATION; 100-row pages; sort by any column; running balance only in date order ("n/a" otherwise); filter by status/type/date/payee; print/export/gear.
2. Row click = inline edit with Save/Edit/Cancel/Delete; Edit = the original document form (expense, bill, bill payment, deposit, transfer, check, JE, invoice, payment) with its "online banking match" banner (DATE/TYPE/AMOUNT/BANK DETAIL/MODE/[Unmatch]) and attachments.
3. ✓ = blank/C/R, owned by match (C) and closed reconciliation (R); click toggles blank↔C; R locked behind a warning.
4. Reconcile: statement date + ending balance → DATE and CLEARED DATE per line, Payments/Deposits/All tabs, live arithmetic header, Save for later, Finish at $0.00 → rows R + "Reconciled through" + stored report.
5. Bank transactions (feed) screen: For review / Categorized / Excluded; each feed row shows Match / Add / Transfer with "find other matches" (suggestions list with amount/date tolerance) and the "match to another" popup — captured next if the owner opens it.
6. Classes = units (T147, T163, 10224…) on every money line; load number in REF NO./memo; attachments on everything.

## 8. RECONCILE FILTER POPOVER (captured)
Filter button opens a popover: Find (text: "Memo, Ref. no, $amt, >$amt, <$amt" — amount operators supported) · Cleared status (All / Cleared / Not cleared) · Transaction type dropdown with the full document-type list: All, Bill, Bill Payment, CC Bill Payment, Cash Expense, Check, Credit Card Credit, Credit Card Expense, Credit Card Payment, Credit Memo, Deposit, Expense, Invoice, Journal, Paycheck, Payroll Adjustment, Payroll Check, Payroll Refund, Receive Payment, Refund, Sales Receipt, Sales Tax Adjustment, Sales Tax Payment, Tax Payment, Transfer, … · Payee dropdown · Date preset ("Statement ending date") with From / To (05/31/2026) · [Reset] [Apply].
→ IH35: the same popover on the reconcile grid and on every register; our TYPE list = our document types (expense, bill, bill payment, deposit, transfer, check, JE, invoice, payment, credit memo, settlement payment, factoring advance, fuel event).

## 9. CHECK FORM with "ADD TO CHECK" drawer (captured: Check #4033, payee Neftali Coronado Urbano, PNC-2786)
- Header: Payee (dropdown) · Bank Account (dropdown, shows "Balance $524.37" next to it) · AMOUNT big at right ($0.00 until lines exist).
- Mailing address (prefilled from payee) · Payment date (09/30/2026) · Check no. (4033, auto-incremented per bank account; "Print later" checkbox) · Location · Settlement No (IH35 custom field).
- CATEGORY DETAILS grid (#, CATEGORY, DESCRIPTION, AMOUNT, BILLABLE, CUSTOMER, CLASS) + ITEM DETAILS (collapsed) · Total · Memo · Attachments ("Add attachment", "Max file size 20MB", "Show existing").
- Footer: [Cancel] [Clear] · Print check · Order checks · Make recurring · More · [Save] [Save and close ▾].
- RIGHT DRAWER "Add to Check": every OPEN BILL for this payee as a card — "Bill #12737-5428 · Jan 16, 2026 · $60.25 · [Add] [Open]", "Bill #13191-5639 · May 10, 2026 · $990.15", "#13210-5639 $513.90", "#13213-5639 $711.60", "#13358-5700 $964.16" … with [Add all] at the top.
  → Add turns the check into a BILL PAYMENT for that bill (the line comes from the bill, the bill's balance drops, A/P is credited); Open shows the bill. The bill number carries load-settlement ("12737-5428" = load 12737, settlement 5428).
- Mechanism for IH35: on the Check/Payment form, a side drawer lists the payee's open documents (driver bills, vendor bills, settlements due) with Add / Add all / Open; adding links the payment to the document and posts against A/P (or the driver payable) — never a free-form amount when an open document exists.

## 10. BILL PAYMENT form — "Outstanding Transactions" (captured: Bill Payment #4033, same payee, Amount $246.86)
The check became a Bill Payment the moment a bill was added. The body is the payee's OPEN-ITEM list:
- "Outstanding Transactions" · Find Bill No. · [Filter >] · All · gear.
- Grid: ☐ | DESCRIPTION ("Bill # 4914 (06/23/2025)" — bill number + bill date, link opens the bill) | DUE DATE ▲ | ORIGINAL AMOUNT | OPEN BALANCE | PAYMENT (editable per row).
- Rows (14 open bills for this driver/vendor): 4914 $1,008.78 open $36.36 → paying $36.36; 4943 $1,930.06 open $210.00 → $210.00; 5041 $1,617.71 open $0.50 → $0.50; 5119 open $461.00; 5303 open $5.00; 5332 $711.56; 5342 $454.10; 12737-5428 $60.25; 13191-5639 $990.15; 13210-5639 $513.90; 13213-5639 $711.60; 13358-5700 $964.16; 13503-5770 $997.15; 13509-5770 $946.65.
- Checking a row fills PAYMENT with the open balance; typing a smaller amount = partial payment; the header Amount recomputes.
- Bottom right: "Amount to Apply $246.86 · Amount to Credit $0.00 · [Clear Payment]"; Memo; Attachments; 1-14 of 14, paging.
- Footer: [Cancel] [Clear] · Print check · Order checks · [Save and close ▾].
- Mechanism: ONE payment can settle MANY open bills (partial or full), each application recorded against its bill; the open balance is what the register and the aging report show; overpayment becomes a credit ("Amount to Credit").
→ IH35: driver payables and vendor bills must present exactly this open-item application grid on a payment; settlement numbers inside bill numbers (load-settlement) are how the owner reads them.

## 10b. (bill payment, continued) checking a 4th bill (5119, $461.00) → Amount to Apply recomputed to $707.86 instantly; header Amount followed. Partial + full applications mixed in one payment.

## 11. CHART OF ACCOUNTS list = the entry to every register (captured)
- Filter by name or number · type dropdown (All) · Batch edit · export/print/gear · [Run report] [New account ▾].
- Columns: ☐ | No. | Name | Account type (with a bank-feed icon + "BAL" chip when connected) | Detail type | Description | QuickBooks balance | Bank balance | Action [View register ▾].
- Two balances per bank account, side by side: QuickBooks balance (book) vs Bank balance (feed) — e.g. WF - General Operating 6103: $70,469.86 vs -$190.81; PNC-2786: $524.37 vs -$5,100.36; WF - Payroll 6129: -$57,404.74 vs -$127.92; Faro Factoring Reserves -$29,312.57; RTS-Factoring Reserves -$446,209.82; Comdata-Prepay Express Code Account -$246,665.63; Transportation/Trucking Loan Account -$14,000.00; Cash on hand $0.00.
- "View register" on EVERY account (bank, savings, cash on hand, loan, factoring reserve, credit card, A/P, A/R, expense, income, liability, equity) → the same register component from §1-§4; the Action menu also offers Edit, Make inactive, Run report.
→ IH35: Chart of accounts page = this list with both balances and a View register action on every row; one register component serves every account type.

## 12. "+ CREATE" MENU — the one global creator (captured)
Four columns + Other, available from every screen:
- CUSTOMERS: Invoice · Payment links · Receive payment · Statement · Estimate · Sales order · Credit memo · Sales receipt · Recurring payment · Shipping label · Refund receipt · Delayed credit · Delayed charge · Proposal · Contract · Add customer.
- VENDORS: Expense · Check · Bill · Pay bills · Purchase order · Item receipt · Vendor credit · Credit card credit · Print checks · Add vendor.
- TEAM: Payroll · Single time activity · Weekly timesheet · Add contractor.
- PROJECTS: Project · Project estimate · Change order · Project budget.
- OTHER: Workflow automation · Task · Bank deposit · Transfer · Journal entry · Inventory adjustment · Batch transactions · Pay down credit card · Apply for Capital · Add product/service.
→ IH35: one "+ Create" menu grouped the same way (Customers / Vendors / Drivers-Team / Loads / Other); every document type that appears in a register must be creatable from here and from its register.

## 13. CHECK CREATOR (+ Create → Vendors → Check), fresh (captured: Check #4033 again from the creator)
- Opening a NEW check from the creator: Payee empty until chosen; choosing the payee (Neftali Coronado Urbano) immediately (a) fills Mailing address, (b) opens the right drawer "Add to Check" listing that payee's open bills oldest first (4914 Jun 26 2025 $36.36 · 4943 Jul 6 2025 $210.00 · 5041 Aug 11 2025 $0.50 · 5119 Sep 9 2025 $461.00 · 5303 Nov 27 2025 $5.00 · 5332 …) each with Add / Open, plus Add all.
- Bank Account dropdown shows the live book balance beside it ("Balance $524.37"); Check no. auto = next number for THAT bank account (4033 on PNC-2786); Payment date defaults to today; Print later checkbox.
- Settlement No is an IH35 custom header field on checks too.
- Amount $0.00 until a category/item line or an added bill exists; Total mirrors.
- Rules the form enforces: a check to a payee with open bills is steered to bill payment (drawer); a check with category lines is a direct expense against the bank; both post Cr bank. Print check / Order checks / Make recurring / More (Void, Delete, Transaction journal, Audit history).
→ IH35 Check creator: payee → auto-drawer of open items (driver bills, vendor bills, settlement balances) → Add turns the check into a payment application; bank account with live balance; per-bank check numbering; Settlement No; attachments; Save / Save and close / Print.

## 14. THE DRIVER BILL = SETTLEMENT (captured: Bill #4914, Neftali Coronado Urbano, opened from the check drawer's "Open")
This is how a driver settlement lives in QBO — as a VENDOR BILL to the driver:
- Header: Vendor (driver) · Mailing address · Terms (3 days) · Bill date 06/23/2025 · Due date 06/26/2025 · Bill no. 4914 (= settlement number) · Location.
  Top-right status: "1 payment made ($972.42)" with the open balance behind it (owner's register showed open $36.36).
- IH35 custom fields on the bill header: NB-Load Number (11438/11469 — multiple loads on one settlement) · Settlement No (4914) · Truck No (T174/TR FB-56709 — truck + trailer) · Pick Up Date · Delivery Date · Empty Miles · Loaded Miles · 1-Origin- · 2-Destination- · Work Order-.
- CATEGORY DETAILS lines (each line = one settlement component, each to its own GL account):
  1 Operational Expenses:COL-Line Haul Driver Payment — "SETTLEMENT NO. 4914" — $862.67
  2 Operational Expenses:COL-Line Haul Driver Payment:CL-Dri… — "ESTANCIA POR DIA DIA 21 Y 22 DE JUNIO" — $50.00 (layover per diem)
  3 Operational Expenses:COL-Line Haul Driver Payment:CL-Dri… — "ENLONADAS Y DESENLONADA" — $50.00 (tarping)
  4 Operating Expenses Transportation:OTR-Scale Expenses — "CAT SCALES" — $14.75
  5 Operating Expenses Transportation:Fuel-COGS:Fuel-Def — "LOVES DEF" — $31.36
  Total $1,008.78 · Memo "SETTLEMENT NO. 4914" · Attachments (the signed settlement PDF goes here).
- Footer: [Cancel] · Print · Make recurring · More · [Save bill] [Save and close ▾].
MECHANISM: settlement → one bill per settlement to the driver (payee), lines per pay component on their own accounts, bill number = settlement number, loads/truck/trailer/dates/miles as header fields; payment = Check/Bill Payment applying against this bill (partial allowed), open balance visible everywhere; the A/P register shows the bill and its payments; the bank register shows the payment; reconcile clears the payment.
→ IH35 (driver_finance): our driver_bills + settlements must render and behave exactly like this bill: header custom fields (loads, settlement no, truck/trailer, pickup/delivery, miles, origin/destination, WO), component lines mapped to catalogs.accounts, "N payment made ($x)" badge, open balance, attachments, Print, Save and close. The owner seeds settlements through the Settlements creator; this is the shape they must produce.

## 15. CHECK CREATOR — blank state + DRAFT mechanism (captured)
- Blank new check: Payee placeholder "Who did you pay?" (focused first), Bank Account defaulted to the last used (PNC-2786, Balance $524.37), Payment date = today, Check no. = next for that bank (4033), Print later, Location, Settlement No, empty Category lines 1-2, Item details collapsed, Memo, Attachments, Total $0.00.
- Banner: "You have a draft saved. Restore draft" — an abandoned, unsaved check is auto-kept as a draft and offered back; Restore draft re-fills the form.
- Footer: [Cancel] · Print check · Order checks · Make recurring · More · [Save] [Save and close ▾] (the ▾ offers Save and new / Save and print).
→ IH35: every creator (check, expense, bill, invoice, settlement) keeps an auto-draft per user and offers "Restore draft"; Save and close ▾ with Save and new.

## 16. BANK TRANSACTIONS (the feed screen) — top (captured)
- Header: "Bank transactions" · [Update] · "Try new banking page" · [Link account].
- Connection-error strip, per account, with the bank error code and the three honest options: "IBC-5231 — Error 103 — Username/password not working. You can send a request to jorge munoz or fix now or disconnect. All options keep your existing transactions." / "PNC-2786 — Error 350 — Account disconnected …" (+6 more). The feed NEVER silently goes stale: it says which account, which error, since when.
- Account CARDS strip (one per connected account), each: name · BANK BALANCE (feed) · "Updated 1 hour ago / Updated on 4/14/2026" · badge = count of transactions FOR REVIEW · IN QUICKBOOKS (book balance). Examples: WF - General Operating -$190.81 bank / 40 for review / $70,469.86 in QB · WF - Savings 6137 -$125.95 / 35 / -$81,033.74 · WF - Payroll 6129 -$127.92 / 21 / -$57,404.74 · Relay-Diesel Bank $0.00 (4/14/2026) / 29 / $100,856.67 · Comdata-Prepay $0.00 / -$246,665.63 · CL-CC:Comdata-Driver $0.00 / 3 / -$112,495.56 · Faro Factoring Reserves $0.00 / -$29,312.57 · CL-CC:Discover $31,245.32 / 86 / $24,733.21 · CL-CC:Amex $38,526.07 / 74 / $97,670.46 · CL-CC:Citi-Executive $50,243.85 / $19,897.74 · VANTAGE-6107/6224/6071 · PNC-2954/2962/2786 · IBC-5231 / IBC-AHORROS-6089 …
→ IH35 Banking home: one card per bank/credit/factoring/fuel-card account with feed balance, last-updated, for-review count and book balance; a per-account connection-error strip with the provider's error and "fix now / disconnect / request" actions.

## 17. BANK TRANSACTIONS — the FOR REVIEW grid (captured, WF 6103)
- Tabs (above): For review · Categorized · Excluded. Grouped view toggle: "Collapse all groupings" with groups "Money in (1)" / "Money out (49)".
- Columns: ☐ | DATE | BANK DETAIL (bank text: "ELITE BORDER FRE DES:ACH Pmt ID:X…", "Check Image 1020", "Zelle payment to Adrian Trujillo for 'SE…'", "CITI AUTOPAY DES:PAYMENT ID:XXXX", "SHEFFIELD FIN DES:PHONEDRAFT ID:") | PAYEE (QBO's guess, editable) | CATEGORIZE OR MATCH (green link = the suggested category or the matched document, e.g. "Operational Expenses:Shipping …", "Building Rent & Lease Expense", "Repair & Maintenance Expenses", "CL-CC:Citi-Executive Card") | SPENT | RECEIVED | 📎 | ACTION [Add] (or [Match] / [Transfer] / [View] when a match exists).
- Rows: 10/02/2025 ELITE BORDER FRE … received $2,450.00 → Add; 05/30/2025 TAX_REV_WDT_ECKS DES:TRD PMNT payee "Department of…" $10.00; check images 1020/1363/1083/1078/1010/1348/1284/1304/1631/1714/1730/1630/1567/1141 with payees (Hugo Garcia, Tomas Castillo) and suggested categories; CITI AUTOPAY $515.17 → credit-card payment.
- Clicking a row expands it inline into the three modes: CATEGORIZE (payee, category, class, memo, split, add attachment) · FIND MATCH (list of candidate documents within an amount/date tolerance; "match to another" lets you pick any open document or several that sum to the amount) · RECORD AS TRANSFER. Bottom of the expanded row: [Add] / [Match] / [Exclude].
- Suggestions come from RULES (Banking > Rules) and from history; every suggestion is editable before Add.
→ IH35 Bank match: For review / Categorized / Excluded tabs, Money in/out grouping, bank detail text verbatim, payee + category guess from rules, inline expand with Categorize / Find match (tolerance + "match to another" + multi-document sum) / Transfer, Add / Match / Exclude; attachments on feed rows.

## 18. FEED GRID — filter "Suggested matches" + the GEAR (captured)
- Filter chips: "All dates ▾" · "Suggested matches ×" (shows only feed rows that have a candidate document) · search "Search by description, check number, or amount" · paging 1-1 of 1 · print/export/gear.
- A matched row: 08/07/2025 · CHECK NO. 1699 · BANK DETAIL "Check 1699" · PAYEE Jose Santiago · CATEGORIZE OR MATCH = green badge "1 match found" + "Check 1581 06/27/2025 -$900.00 Jose Santiago Alcantar Me…" (the candidate document: type, date, amount, payee) · SPENT $900.00 · ACTION [Match].
  Note the match is by amount + payee across a date gap (bank 08/07 vs check 06/27) and a different check number (1699 vs 1581) — the suggestion engine tolerates date drift and ref mismatch; the human confirms.
- GEAR panel (per-user grid settings): Columns ☑ Check No. ☑ Payee ☐ Class ☐ Location · Groups: Turn off grouping · Automation review: "Add new vendors" toggle · Transaction details: ☐ Show amounts in 1 column ☑ Show tags field ☑ Editable date field ☑ Show bank details ☑ Copy bank detail to memo ☐ Enable suggested categorization · Page size 50 / 75 / 100.
→ IH35: same gear on the match grid (columns, grouping, editable date, copy bank detail to memo, page size); a "Suggested matches" filter; match badge "N match found" with the candidate's type/date/amount/payee inline; Match button right on the row.

## 19. "FIND OTHER MATCHES" = match-to-another popup (captured, advancedmatch for bank row Check 1699, 08/07/2025, Spent $900.00)
Full-screen modal:
- Title "Find other matches" · the bank row restated at top: "Check 1699 · Check 1699 · 08/07/2025" and the amount to match on the right ("Spent $900.00").
- "Find and select record(s) to match" — chips: ✨ Suggested matches · "2 Checks" · "1 Check" (quick views of what the engine proposes).
- Filters: Search (text) · Date range (Custom, with a chip "Date: 05/08/2025–09/05/2025 ×" — default window ≈ ±90 days around the bank date) · Record type (Select… — Check / Bill Payment / Expense / Deposit / Invoice payment / Journal / Transfer …) · [Filters] · [Customize] · print.
- Grid of CANDIDATE DOCUMENTS (all open/unmatched records of the account in the window): ☐ | Date ↓ | Ref No. | Transaction Amount | Payee | Open Balance | Payment (editable).
  Rows seen: 09/05/2025 5115 $1,298.36 Francisco Javier Valenzuela Ruiz open $1,033.30 · 5116 $1,287.95 Juan Andres Cerda Calderon $487.95 · 5114 $1,199.13 Carlos Adrian Martinez Coleotte $50.50 · 5113 $1,177.73 Jorge Luis Infante Corona $5.00 · 5118 $1,710.37 Jorge Graciano Martinez $754.99 · 09/04 5109 $1,172.66 Luis Manuel Zavaleta Landeros $50.00 · 5110 $1,504.24 Jose David Arriola Silva $280.50 · 09/03 5111 $369.76 Isaac Portilla Leyva $255.96 · 09/02 5105 $1,965.04 Feliciano Galvan Garcia $1,965.04 · 5108 $1,116.60 Isaac Portilla Leyva $105.00 · 5103 $912.92 Rafael Rogelio Rivero Reynoso $205.00 · 09/01 5101 $1,449.76 Jose Luis Olvera Davila $1,449.76 · 5100 $4,607.08 Moises Portilla Leyva $3,807.08 · 5104 $1,067.84 Adrian Trujillo Tapia $50.00 · … AUTO LINEAS EDGAR $1,500.00.
  (These are driver settlement checks 5100-5118 — each candidate shows its Open Balance, i.e. how much of the document is still unmatched to any bank row.)
- Selecting one or MORE rows: the Payment column fills (editable); the selected total must equal the bank amount ($900.00) before [Match] enables; a remainder can be resolved by adding a resolving line (bank fee / difference) in the full version.
- Footer: [Cancel] · [Match].
MECHANISM: a bank row can be matched to ANY open document(s) of the right direction within the window, by the human, with amounts summing exactly; the document's Open Balance is the matchable remainder; a match sets the register ✓ to C and shows on the document as the "online banking match" banner (§5) with Unmatch.
→ IH35 MatchDrawer "match to another": this modal — bank row header, suggested chips, search/date/type filters, candidate grid with Open Balance + editable Payment, multi-select summing to the bank amount, Match. Owner's 09-30 design: posting date + transaction date, tri-state MATCHED, blank/C/R.

## 19b. "Find other matches" — bottom of the modal (captured, scrolled)
- Paging "1 - 23 of 23 items" (all candidates in the window, incl. an Ado Transportation Inc "ADO-Trnsp-Week-24" $1,500.00 bill payment and settlement checks 4818-5110 with their open balances $50/$55/$155/$205/$524.56/$955/$970/$1,500).
- ARITHMETIC BOX, always visible: "Bank transaction amount: $900.00 · Selected amount: $0.00 · Difference: $900.00".
- "› If needed, resolve the difference ⓘ" — expandable: add a resolving line (account, amount, memo — e.g. bank fee, rounding, partial) so Selected + resolving = bank amount.
- "ⓘ Total amount: $0.00" (selected + resolving) and [Cancel] [Match] — Match enabled only when Difference = $0.00.
→ IH35: the same arithmetic box on the match-to-another modal: bank amount, selected, difference, resolve-the-difference line, Match disabled until zero.

## 19c. "If needed, resolve the difference" — expanded (captured)
- A mini-grid appears under the candidates: DATE (08/07/2025, defaults to the bank date) | PAYEE (dropdown, "+ Add new") | CATEGORY (defaults "Uncategorized Expense", must be changed) | CLASS (unit) | LOCATION (dropdown of locations; shows the list "Alejandro Monjaraz Perez, Alexis Garcia/Carlos Garcia, Andres Arregui Calderon …" — in this file locations are used per driver/team) | MEMO | AMOUNT (900.00 here, since nothing was selected) | 🗑.
- [Add new row] [Clear all]. Box recomputes: "Resolved amount: $900.00 · Total amount: $900.00" → Match enabled. A resolving row posts a NEW document line (expense/deposit) for the unexplained part, categorized by the human, attached to the same bank row.
→ IH35: the match modal's "resolve the difference" rows = our bank_transaction_splits with payee/account/class/location/memo/amount; total must equal the bank amount; Match creates the split document and the match in one transaction.

## 20. FEED ROW EXPANDED — the four radio modes (captured under the Create menu, row Check 1699)
Under the expanded feed row: ○ Categorize · ● Match · ○ Record as transfer · ○ Record as credit card payment — the fourth mode exists for card-pay rows (bank → credit-card liability). Right side: "Go to bank register" link, "Video tutorials", "Take a tour". The per-account card shows "283" = for-review count for the selected account.
- "Categorize" = create a new expense/deposit from the bank row (payee, category, class, memo, split, attachment) → Add.
- "Match" = link to an existing document (suggested, or Find other matches) → Match.
- "Record as transfer" = bank ↔ bank/loan/credit-card movement, pick the other account → Add.
- "Record as credit card payment" = bank payment that pays down a card account → Add.
→ IH35: exactly these four modes on every bank row; the mode chosen decides which document gets created or linked; one Add/Match button; Exclude for noise.

## 21. "CATEGORIZED" TAB of the feed (captured, BOA-CHECKING-1135, 1-50 of 2444)
- Tabs: For review (54) · Categorized · Excluded. Filters: All dates · All transactions · Filter · search · paging 1 of 49 · print/export/gear.
- Columns: ☐ | DATE | BANK DETAIL | AMOUNT | PAYEE | ADDED OR MATCHED | CATEGORY | RULE | ACTION [Undo].
- Rows: 11/04/2024 "LOVES TRAVEL STO DES:PAYMENTS ID:XXXXXXXX32318 INDN:3484429 II" -$61,186.99 Loves-Diesel Accc — "Added to: Expense 11/04/20…" — Returned/R… — [Undo]; 10/11/2024 "WIRE TYPE:WIRE OUT DATE:241011 TIME:1424 ET TRN:…" -$60,886.08 Loves Truck Care — "Matched to: multiple transac…" — "-Split-" — [Undo]; 10/17, 11/07, 11/13 Love's payments -$60,836/-$59,610/-$59,610 "Added to: Expense".
- Mechanism: every feed row that was Added or Matched stays listed with WHAT it became ("Added to: Expense <date>" / "Matched to: multiple transactions") and the rule that did it; [Undo] reverses the categorization/match and sends the row back to For review (the created document is deleted / the match removed). Multi-document matches show "-Split-".
→ IH35: Categorized tab with Added/Matched provenance, rule name, and a one-click Undo that unwinds the match or deletes the auto-created document (never a silent orphan).

## 22. GEAR MENU (⚙ top right) — the admin surface behind the registers (captured)
YOUR COMPANY: Account and settings · Manage users · Custom form styles · Default report settings · Chart of accounts · Payroll settings · Workers' comp · HR advisor · Employee benefits · Get the desktop app · Additional info · Priority Circle.
LISTS: All lists · Products and services · Recurring transactions · Attachments · Custom fields · Rules.
TOOLS: Manage workflows · Reclassify transactions · Order checks · Import data · Import desktop data · Export data · Reconcile · Budgeting · Spreadsheet Sync · Audit log · Back up company · Share screen · Resolution center.
PROFILE: Subscriptions and billing · What's new · Discover more · Feedback · Privacy · Your Privacy Choices · Switch company.
→ IH35 settings menu: the same four groups; Reclassify transactions, Rules, Custom fields, Attachments list, Audit log, Reconcile, Import/Export are first-class tools, not buried.

## 23. BATCH TRANSACTIONS (owner: "very important to build, follow for the batch transactions")
Entry: + Create → Other → Batch transactions. One spreadsheet-style grid to enter MANY documents of one type at once (Expenses, Checks, Bills, Invoices, Deposits …):
- Pick the transaction type at the top; the grid shows one row per document with the document's header fields as columns (date, payee, bank/A-P account, ref no., amount, category/account, class, memo, attachment) and split rows for multi-line documents.
- Paste from a spreadsheet; duplicate a row; fill-down; validation per cell (red) before Save; "Save" posts every row as its own document in one batch; errors keep the row unsaved with the reason.
→ IH35: a Batch creator for Expenses / Checks / Bills / Deposits (and Settlements) with paste-from-sheet, per-row validation, one Save, each row becomes a real document with the same engine as the single creator. (Owner to show the live screen next; this section is completed from it.)

## 24. RECLASSIFY TRANSACTIONS (Tools → Reclassify; captured, 08/01/2026–09/30/2026) — THIS is the batch mechanism the owner means
- LEFT PANE: the chart of accounts as a tree with the period balance per account (Fuel-Truck-Diesel Expense $136,788.29 · OTR-Bridge & Toll $541.79 · OTR-Scale $234.50 · OTR-Truck Parking $55.76 · Vehicle Insurance: US-Cargo $75,913.52, US-Office Auto $43,136.13 · Vehicle Registration & Taxes: Permit-Driver Intl $147.45, Permit-Individual Load & Travel State $72.34 · Reconciliation Discrepancies $3,818.57 · Repair & Maintenance $4,480.16: External Mechanic Shop $1,669.74, Road Service-Repairs(645.30) $55.87, Towing $779.48, Trailer Tires(645.30) $1,117.95, Truck & Reefer Washout(345.30) $808.17, Truck Tires(645.30) $3,420.93 · Returned/Reverse-NSF Checks $0.00 …). Clicking an account = the working set.
- RIGHT PANE filters: From / To · Type (All / Expense / Bill / Check / Invoice / JE …) · Class (unit) · [Filters] · chip "Account: All" · [Find transactions] · search by memo or description.
- Result grid (after Find): ☐ | Date | Type | Num | Name | Memo/Description | Account | Class | Location | Amount — select many → bar at the bottom: "Reclassify" with target Account / Class / Location → applies to ALL selected lines in one batch, each document updated and re-posted, audit per document.
- Empty state: "Do a quick cleanup — Reclassify the account, class on a bunch of transactions at once. Select a date range to find the transactions you want to change."
MECHANISM: batch re-categorization across documents without opening each one; the left tree doubles as a period P&L/balance by account; class (unit) reassignment in bulk; every change still audited per document.
→ IH35 "Batch transactions / Reclassify": account tree with period balances → find lines by date/type/class/memo → multi-select → reclassify account/class/location in one action → each document re-posted through its own engine, audit row each, undo per batch.

## 24b. RECLASSIFY — result grid (captured, Account: Fuel-Truck-Diesel Expense, Aug 1–Sep 30 2026)
- Chip "Account: Fuel-Truck-Diesel Expense ×"; left tree highlights the account ($136,788.29 for the period; siblings Fuel-Def $50.00, Fuel-Reefer-Diesel $70.00).
- Bar: ☐ select-all · [Reclassify] (disabled until selection) · "0 transaction lines selected: $0.00" (live count + sum of the selection) · gear.
- Columns: ☐ | DATE | TYPE | ACCOUNT NO. | ACCOUNT | MEMO/DESCRIPTION | NET AMOUNT.
- Rows (GL LINES, not documents): 09/01/2026 Expense "Zelle payment to Dreamli…" $6,767.78 · 08/31 Expense "Zelle payment to Dreamli…" $7,300.00 · 08/31 Bill "Total Payables 08/27/26 …" $6,742.18 · 08/31 Bill "Total Discounts 08/27/26…" -$461.90 · 08/27 Bill Total Payables 08/24 $12,582.33 · Total Discounts -$794.83 · 08/24 Bill $15,047.65 / -$864.67 · 08/20 Bill $9,525.46 / -$404.01 · 08/19 Deposit "ZELLE FROM LAURA MU…" -$500.00 · 08/18 Deposit "MONEY TRANSFER AUT…" -$1,282.28 · 08/17 Deposit "eDeposit in Branch 08/1…" -$2,000.00 · 08/17 Bill $10,628.73 / -$723.86 · 08/14 Bill "13517-5774/Fuel-Truck D…" $45.47 · 08/13 Bill $9,379.97 …
  (These are the Relay/Dreamline diesel bills with their payables and discounts, plus Zelle deposits/payments hitting the diesel account — the exact lines the owner reconciles.)
- Selecting lines → Reclassify → modal: "Change account to ▾ / Change class to ▾ / Change location to ▾" → Apply → every selected line's document is updated, audit per document, totals in the left tree refresh.
→ IH35: the Reclassify grid works on journal LINES (date, type, account no., account, memo, net amount) with a live "N lines selected: $sum" bar; Reclassify modal changes account / class(unit) / location across all selected lines through each document's own engine.

## 24c. RECLASSIFY MODAL (captured: Type filter = Expense, 7 lines selected → "Reclassify 7 transaction lines")
- Info line: "You can now reclassify the vendor/customer name from this page."
- Four optional changes, each a dropdown with Select…: Change account to · Change class to · Change location to · Change vendor/customer to. Leave blank = unchanged.
- [Cancel] [Apply]. Apply rewrites those fields on all 7 lines (7 documents), re-posts each, audit per document; the grid and the left-tree balances refresh.
→ IH35: Reclassify modal with account / class(unit) / location / vendor-customer, each optional; applied through each document's engine; one audit row per document naming the batch id.

## 24d. RECLASSIFY — selection state (captured: Account: Fuel-Truck-Diesel Expense + Type: Expense, select-all)
- Chips stack: "Account: Fuel-Truck-Diesel Expense ×" · "Type: Expense ×". Header checkbox selects the whole page; bar reads "7 transaction lines selected: $43,145.78" and [Reclassify] turns active (dark).
- The 7 Expense lines on the diesel account for Aug–Sep: 09/01 Zelle payment to Dreamline $6,767.78 · 08/31 Zelle payment to Dreamline $7,300.00 · 08/11 ZELLE TO USMCA ON 08/… $2,595.00 · 08/11 ZELLE TO USMCA $390.00 · 08/07 WITHDRAWAL MADE IN A… $9,750.00 · 08/07 PURCHASE AUTHORIZED … $413.00 · 08/04 WITHDRAWAL MADE IN A… $15,930.00. Paging 1-7 of 7.
- Workflow the owner is showing: filter to the account → narrow by type → select all → Reclassify → pick new account/class/location/vendor → Apply. This is how he fixes a whole month of mis-categorized fuel in one pass (e.g. Zelle-to-Dreamline rows that belong on Relay/Dreamline payables, cash withdrawals that are driver advances).
→ IH35 acceptance: the selection bar must show count + sum live; filters stack as removable chips; select-all per page; Reclassify applies to the selection only.
