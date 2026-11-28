# ROUND L.31 · LEAD · MASTER PERFUME / SCENTSX WORK DISTRIBUTION · 2026-11-27 19:45 CT (01:45 UTC 11-28)

Owner 19:38 CT (verbatim): "P1 HAS NOTHING ASSIGNED RIGHT NOW. CHECK REPO AND JOURNALS FOR ALL PENDING WORK, AND DISTRIBUTE TO ALL CODERS,
FULL CODING, WIRING, MECHANICAL, ECONOMIC, FINANCIAL, MONEY, AR, AP, ASSETS, LIABILITIES, CUSTOMERS, VENDORS, ITEMS PRODUCTS, CATALOGS,
ACCOUNTING, CHART OF ACCOUNTS, PAYMENTS, BILL PAYMENTS, CUSTOMER PAYMENTS, ETC. ALL FULLY COMPLETELY DONE … ALL CODERS MUST FOLLOW FAST
MERGE LAW, FAST 4 MINUTE WEEKEND MERGE METHOD. IF OPEN AND PASS LOCAL, MERGE IMMEDIATELY ALL CODERS."

## MEASURED (production, 01:40 UTC 11-28, ScentsX = org.companies code SCENTSX)
- Chart of accounts: 74 live accounts (1000 Operating Checking … 9000 Ask My Accountant).
  - Roles bound: AP 2000, AR 1100, GRNI 2050, Inventory 1200, COGS 5000, Sales tax 2100, Returns 4800, Undeposited 1090.
  - Unused so far: 1030 Card Settlements, 1150 Notes Receivable, 1310 Supplier Deposits, 1500/1600 Fixtures + Accum. Depreciation, 2150 Customer Deposits, 2400 Loans from Owner, 2500 Notes Payable, 3000 Capital, 3100 Draws, 5100 Freight In, 5110 Customs, 6000–6990 expenses, 6700 Bad Debt, 6800 Depreciation.
- Transactions: 0 invoices · 0 bills · 0 payments · 0 journal entries · 0 sales orders · 0 POs · 0 quotes (opens at $0, owner law 14:12 CT).
- Banks: 4 (1000, 1010, 1020, 2010). mdata customers 2 · mdata vendors 30.
- Perfume: contact companies 3,810 live · items 31,385 · purchase-history customer numbers unlinked 1,441.
- ENGINES THAT EXIST (reuse, never new GL math): accounting/bank-deposits, accounting/checks, accounting/bank-recon,
  accounting/expense-writer, accounting/balance-sheet, fixed-assets, bills.service (createBillInClientTx / payBillInClientTx),
  vendor-credits, credit-memos, payment engine (Receivables #29943), journal-entry writer (createJournalEntryOnClient), stock-move-poster.

## RULES FOR EVERY SEAT
1. Perfumes / ScentsX only. Trucking is frozen; park anything else.
2. FAST MERGE LAW: targeted local tests + the guards you touched → PR (body passes node scripts/cursor-pr-body-gate.mjs) → squash-merge at once. Never --no-verify, never weaken a guard.
3. Money:
   - reuse the posters and writers above;
   - classify every new JE source in posting-line-writer;
   - new tables need a CANONICAL-CHECK block, literal ENABLE + FORCE RLS lines and a canonical-relations.json entry;
   - claim the migration number first (highest claimed: 202617210100).
4. QuickBooks style (owner 17:25 CT): every confirm / create / edit is a pop-up (Modal); section titles use `cardTitle` / .text-card-title; every bulk list has ParityTable `selectable` (owner 18:21 CT).
5. No sample / test rows in production. DONE = merged PR + the live row / screen / JE pasted on ~/Desktop/00-PERFUME-SEATS-SHARED-BOARD.md.

## THE LIST (numbered) — SEAT · DEADLINE (UTC 11-28)

### A/R — customer money
- M1 Receive payment across several invoices + unapplied credit + customer deposits (2150) applied later · CC1 · 06:00
- M2 Apply a credit memo to an invoice; customer refund (check / cash) from a credit or overpayment · CC1 · 08:00
- M3 Bad-debt write-off of an invoice (Dr 6700 / Cr 1100) with reason + history · CC1 · 09:00

### A/P — vendor money
- M4 One check pays several bills (D4) · CC2 · 03:00
- M5 Expenses / write checks / credit-card charges (6000–6990, 2010 card) through the expense writer + check engine, for ScentsX · CC2 · 07:00
- M6 Supplier deposits (1310 prepaid inventory) paid before goods, applied to the bill · CC2 · 09:00

### Banking
- M7 Deposits (D3): 1090 Undeposited → 1000 bank; cash registers 1010 → bank · CC2 · 03:00
- M8 Daily transactions report (D1) + end of shift drawer count → over / short (D2) · CC2 · 05:00
- M9 Card sales → 1030 Card Settlements Receivable; settlement deposit nets 6100 card fees · CC2 · 10:00
- M10 Bank reconciliation for the 4 ScentsX accounts (bank-recon engine) + transfers between 1000 / 1010 / 1020 · CC2 · 12:00

### Liabilities, taxes, equity
- M11 Sales tax: liability report by period from 2100, "Pay sales tax" (Dr 2100 / Cr bank), resale-certificate exempt customers (Accounts already store resale_certificate) · CC3 · 10:00
- M12 Owner money: owner contribution (Dr bank / Cr 3000), owner draw (Dr 3100 / Cr bank), loan from owner (Cr 2400) + repayment — pop-ups, JE writer · LEAD · 06:00
- M13 Notes payable 2500: loan record, payment schedule, interest 7300 split on each payment · LEAD · 10:00

### Assets
- M14 Fixed assets (1500 fixtures) register + monthly depreciation (Dr 6800 / Cr 1600) via the fixed-assets engine for ScentsX · LEAD · 10:00
- M15 Landed cost on a received PO: freight-in 5100 + customs 5110 spread into item cost (GRNI / inventory) · P1 · 09:00

### Statements / books
- M16 ScentsX P&L, Balance Sheet, Trial Balance, GL detail, Cash flow, A/R + A/P aging reports — date range, drill-down to the document, Excel + PDF — reusing accounting/balance-sheet + report engines under operating_company_id SCENTSX · LEAD · 06:00
- M17 Manual journal entry pop-up (balanced, accounts from the ScentsX chart) + closing-date lock for ScentsX · LEAD · 08:00

### Customers / vendors / items / catalogs
- M18 Customers E1 import (815 USA + 674 MX from ~/Downloads/11-27-2026-TIO-Customers-Sales-USA-and-Mexico.xlsx) · E2 bulk Make ScentsX customer · E3 salespeople + commission report · CC3 · E1 02:30, E2 05:00, E3 08:00
- M19 Customer center + vendor center, QuickBooks style:
  - open balance, transactions tab (quotes / orders / invoices / payments / credits / bills / POs), statement, notes;
  - built on the one company record (#29985) · P1 · 06:00
- M20 Catalogs wired into documents: payment terms (Net 0/15/30/60), payment methods, shipping methods, sales-tax codes — chosen on quote / SO / invoice / PO / bill / payment; due date from terms · P1 · 05:00
- M21 Items → books: per-item accounts by category (income 4000/4010/4020, COGS 5001–5004, inventory 1201–1204) bulk-assigned + bulk "Make ScentsX item" for every stock item (item-accounts.service) · P1 · 08:00
- M22 Invoice + packing slip print / e-mail from the SO and the invoice (server-rendered like the count sheet) · P1 · 10:00
- M23 Bulk Make ScentsX vendor for every linked supplier (CC1 item 13) · CC1 · 04:00
- M24 C2 full vendor names + C3 left-align / click-through (in flight) · CC1 · 02:30
- M25 Price desk remainder (owner 15:45 CT list: 4 same filters every tab, 5 Sonia from her workbooks, 7 list analysis multi-select, 9 desk grid left-aligned + clickable, 11 confirm prices into lists) · P1 · 07:00

### LEAD (also)
- M26 Review every merged money PR (debits = credits, entity = SCENTSX, history rows), live proofs, board + journal, take over any seat that misses its deadline.
- M27 Vendor ranking by purchases once POs / bills exist; re-link purchase history after CC3 E1 (button shipped #30007).
