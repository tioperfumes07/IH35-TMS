# ROUND 155 — ALL SEATS (CC-1, CC-2, CC-3, CODEX) — THE SOURCE MAP AND THE POSTING LOGIC. NO MORE BLOCKERS.
Claude Lead, 09-25-2026 4:22 AM CT (09:22Z). Every path below was opened by the Lead at 09:15–09:20Z on this Mac.

Owner, 4:12 AM CT: "OR WE PAY DIRECTLY TO RELAY OR DREAMLINE FROM OUR BANK ACCOUNT, ETC. I NEED YOU TO PROVIDE THE CODER ACCESS AND MAPPING TO ALL THE FILES, COMPANY AND DRIVER SETTLEMENTS, RECONCILIATION, I DO NOT WANT ANYMORE BLOCKERS… ALL RECONCILIATION HAS BEEN MADE… ALL IT NEEDS TO DO IS SEED THE CORRECT DATA TO THE CORRECT TABLES AND CREATE THE CORRECT DOCUMENTS/EXPENSES, VENDOR BILLS, CASH ADVANCES-BILL PAYMENTS-, INVOICES, CORRECT ACCOUNTS, ETC."

**Access:** every seat runs as user `jorgemunoz` on this Mac and can read `~/Downloads` and `~/Desktop` directly. Nothing needs copying. If a path below does not open for you, that is a bug in your sandbox; say so on your NOW file in the same minute.
**The work is SEEDING, not reconciling.** The reconciliation is done and closed. You read the authority, you create the document through the app's existing writer, and you post to the account in §3. You never re-derive a number that is written in these files.
**A "blocker" that this file answers is not a blocker.** `DECISION NEEDED` is allowed only when two authorities below contradict each other, and you must quote both lines.

---
## 1. THE AUTHORITIES — where each truth lives
| Truth | File (open it; never derive it) |
|---|---|
| Faro, per invoice (89) | `~/Downloads/IH35-RECONCILIATION-AND-FEED/06-OUTPUT/faro_reconciliation_register.csv` (faro_date, faro_inv, faro_debtor, purchase, po, class, tms_load, tms_customer, note) |
| Faro, per purchase (fees, escrow, net) | `~/Desktop/IH35-FARO-RECONCILE/faro_canonical_purchases.csv` · `faro_daily_totals.csv` · `~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/` (PURCHASE REPORT ALL, RESERVE REPORT, PAYMENTS TO USMCA FROM FARO, ACCOUNT SUMMARY, faro_load_map.json) |
| Faro day membership (23 days) | `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/day_control.json` → `inv[]` is the authority |
| Faro receipts / open A/R | `~/Downloads/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/AGING REPORT.csv` · `funds due report 09-21-26.csv` · `FEES PAID.csv` |
| Settlement documents (tour = settlement = document) | signed PDFs: `~/Downloads/Company_Settlement_<n>.pdf` (90) · `~/Downloads/Driver_Settlement_<n>.pdf` (74) · also `~/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/{company-pdf,driver-pdf,text}` |
| Every load's item lines (124 loads, 1,165 lines) | `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json` · gaps `06-OUTPUT/feed_input_gaps.json` (19 lines / $1,571.91; open the PDF, never guess) |
| Per-settlement control | `01-ENGINES/settlement_control.json` · repo `data/alwaystrack/settlements-truth-2026-09-13.json` |
| AlwaysTrack parity (34 docs 5769–5803) | repo `scripts/verify-alwaystrack-parity.mjs` · `~/Downloads/IH35-MASTER-RECONCILIATION/02-ALWAYSTRACK/Report (n).xlsx` |
| Cross-references (done) | `~/Downloads/IH35-MASTER-RECONCILIATION/07-RECONCILIATION-OUTPUT/` — FARO-INVOICE-TO-LOAD-COMPLETE, FARO-x-ALWAYSTRACK-CROSS-REFERENCE, IH35-MASTER-RECONCILIATION-2026-09-21 (sheets FARO LOAD MAP, EXCEPTIONS), IH35-FARO-FULL-RECONCILIATION-2026-09-22 · `~/Desktop/IH35-AUGUST-RECONCILIATION-BOTH-ENTITIES.xlsx` (FARO · USMCA) |
| The 5 self-carried invoices (not Faro, $12,592.40) | `~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/` (009 FLS, 010 Supply Chain Mgmt, 026 IM Specialized, 055/13555 2EMS, 074/13593 Alligator) |
| Rate confirmations | `03-SOURCE-DOCUMENTS/rate-confirmations/` · `01-ENGINES/rate_confirmations.json` |
| Item catalog (QBO clone, 137 items) | `03-SOURCE-DOCUMENTS/09-22-2026-QBO-LIVE-ITEM-CATALOG-126.csv` · `01-ENGINES/item_catalog_seed.csv` |
| **Dreamline card statement** (08-07 → 09-21) | `~/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` (397 rows, real State column) · `04-FUEL/transactions_2026-08-07_2026-09-30.xlsx` (403 rows, total 151,329.36) |
| **Relay fuel** (USMCA runs on the TRANSPORTATION Relay account — owner ruling) | live: `integrations.relay_fuel_transactions` (USMCA 76 rows; TRANSP-company rows 1,635: **read-only**, only to pick out USMCA units' fills, which the owner ruled run on that account; never write TRANSP) · Relay API key `RELAY_API_KEY_TRANSP` · live bank feed of the Relay Fuel Wallet (76 rows, +32,726.45, 08-13 → 09-11) |
| **Bank of America USMCA** | live feed `banking.bank_transactions` on bank account `e83028a5…` (625 rows) · file `~/Downloads/IH35-MASTER-RECONCILIATION/06-BANK-QBO/USMCA-BANK OF AMERICA ACCOUNT-TRANSACTIONS 2025-2026.csv` · PDF statements `~/Downloads/eStmt_2026-0*-*.pdf` |
| Love's stores / state | `04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv` |
| Closed law (never reopen) | `~/Desktop/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md` · `~/Desktop/00-TO-THE-NEW-LEAD-WHERE-EVERYTHING-IS-AND-THE-FIVE-TRAPS.md` · `~/Desktop/09-22-2026-IH35-FULL-LINKAGE-PROCESS-AND-MAPPING.md` · `~/Desktop/09-22-2026-IH35-PROCESS-01-FUEL-TRANSACTIONS.md` · `~/Downloads/IH35-RECONCILIATION-AND-FEED/04-RULINGS/` |
| Engines + gates already built | `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/run_feed_day.py`, `02-CONTROLS-AND-GATES/verify-feed-day.mjs` (revenue), `verify-feed-load.mjs` (cost; the feeder must DECLARE cash_advance→bill_payment, escrow→driver_escrow_liability, admin_fee→income) |

## 2. THE ORDER OF SEEDING — per Faro purchase day, document-first, never loose loads
For each of the 23 days in `day_control.json`, in date order:
1. **Settlement document(s)** for the loads in `inv[]` → the tour header → its loads (the `mdata.loads` hub) with stops, unit, trailer, driver.
2. **Customer invoice per load** (line haul = the contracted total + accessorial item lines 4200/4210–4240) → A/R 1100.
3. **Faro purchase of those invoices** (the existing factoring advance writer) → the escrow, reserve, discount, wire and schedule fee split from `faro_canonical_purchases.csv`.
4. **Driver bill** from the driver settlement document (driver pay 5xxx → driver A/P).
5. **Cash advances** paid to the driver → **bill payments** against that driver bill, dated when the money left.
6. **Expenses and vendor bills** on the document (lumper item → 5310, tolls, scales, repairs), with unit, trailer, driver and load.
7. **Fuel lines on the document** → fuel expense per §3 (rail + dedupe).
8. **Receipts** (AGING REPORT / funds due) → customer payment through the existing payment writer.
9. Close the settlement.
- Then the 5 self-carried invoices (never in a purchase day).
- The gates run per day: `verify-feed-day.mjs` + `verify-feed-load.mjs` exit 0 before the next day starts.

## 3. THE POSTING MAP — account per document (closed law; cite this file, not memory)
| Document | Debit | Credit | Writer |
|---|---|---|---|
| Customer invoice (line haul contracted total + accessorial items 4200/4210–4240) | 1100 A/R | revenue via 1150 Unbilled Revenue recognition (live engine: invoice Dr 1100 ×124, Dr 1150 ×11 / Cr 1100 ×11) | invoice writer + revrec latch; do not hand-post |
| Faro purchase (advance), measured live | 1090 Undeposited Funds (the net wire, until it is matched to the BoA deposit) · 1230 Factoring Reserves · 6400 Factoring Fees · 6300 Bank Service Charges & Wire Fees | **2150 Factoring Advance** | factoring advance engine (134 JEs live) |
| Customer receipt | 1090 → matched to the bank deposit | 1100 A/R | customer payment writer (6 live, CC-1 #22569) |
| Driver settlement, measured live | **6890 Cost of Labor–Mexico Drivers** · 5310 Lumper | **2170 Driver Net-Pay Clearing** · **2100-00-0NN per-driver Escrow** · **7200 Driver Admin Fee & Chargeback Income** · 1245 Driver Cash Advances Receivable (the advance recovered) · 5000 (fuel recovered from the driver) | settlement engine (101 JEs live) |
| **Cash advance to driver** | the advance per the settlement engine (1245) | the bank or card it left from | **bill payment**, dated when the money left (closed law) |
| Escrow withheld | inside the settlement JE | **2100-00-0NN** per-driver escrow liability | settlement engine |
| Admin fee · company vehicle use fee | inside the settlement JE | **7200** income | settlement engine |
| Lumper | **5310** (item) | bank / card / driver A/P | expense or bill |
| **Fuel, Dreamline** | **5000** (Truck Diesel / Reefer Diesel / **DEF are ITEMS under 5000**) | **2510 Dreamline Diesel Card Payable** | fuel writer → expense (CC-2) |
| **Fuel, Relay** | **5000** (items as above) | **1295 Relay Fuel Wallet** | fuel writer → expense (CC-2) |
| **USMCA pays Dreamline from the bank** (32 payments, −154,133.95 on BoA) | **2510** | **1000 BoA Operating** | bill payment / card payment, matched to the bank row |
| **USMCA funds Relay from the bank** (2 payments, −6,711.25 on BoA) | **1295** | **1000** | transfer, matched to the bank row |
| Relay funded by Amex-Scentsx | **1295** | **2500 Amex** | transfer |
| USMCA pays Amex (1 payment, −3,000.00 on BoA) | **2500** | **1000** | card payment, matched |
| Honda GASOLINA $10 lines (4, $40) | company expense (reimbursement) | — | NOT 5000, NOT income, NOT IFTA |
| Check (Codex R-154) | category-map / item account | 1000 | expense payment_type check |
| **Never** | — | **1090 Undeposited Funds for any cost** | — |
**CORRECTION to R-153.6 and R-154.1:** both said "DEF → 5010". **Wrong. 5010 is retired (Round 86). DEF is an ITEM that posts to 5000.** Use this table.

## 4. FUEL — CC-2's rail question is fully answered from evidence
- **Rail per row:**
  - it is on the Dreamline statement (the CSV/xlsx above) → **2510**;
  - it is in `integrations.relay_fuel_transactions` for a USMCA unit, or on the Relay Fuel Wallet feed → **1295**;
  - a settlement-document fuel line with neither → match it by unit + date + amount to one of the two. It is the same fill; keep one row, linked to the settlement line.
  - Only two providers exist (owner).
- **The money path is complete:** the card liability 2510 is paid down by the 32 BoA → Dreamline payments. The wallet 1295 is funded by the BoA → Relay payments and by Amex. Match each bank row to its payment (§3). After seeding, 2510 and 1295 balances must tie to the Dreamline statement ending balance and the Relay wallet balance.
- **Totals to hit:** USMCA fuel = AlwaysTrack **110,072.33 over 171 lines**. The residual goes line by line into `docs/bus/fuel-truth-2026-09-25.csv`.
- **The deadlock** (the guard blocks its own fix) stays solved per R-153.7: rehearse on a Neon child branch → run on prod from the branch → the guard goes green → FAST-MERGE.

## 5. RULES THAT END BLOCKERS
1. Answer is in §1–§4 → act. The DoD is the gate exit 0 plus the numbers in §4 / the nine LAW figures (purchases 311,587.00 · receipts 12,825.00 · A/R 298,762.00 · escrow 4,530.19 · discount 4,673.82 · wire 220.00 · schedule 8.22 · 89 invoices · 0.9700).
2. A file you think is missing: `find ~/Downloads ~/Desktop -iname '*<word>*'` before you write "missing". Empty is a question, not an answer.
3. Never test or sample rows in USMCA. Rehearse on a Neon child branch.
4. Void, never delete. Use existing writers only. No seventh reversal engine. No QBO write-back.
5. USMCA only. TRANSP is read-only, and only for the Relay fills the owner ruled are USMCA's.
6. Every write goes through the app's own writer, so linkage (unit, trailer, driver, load, vendor, account, JE, docs.files) is created in the same transaction. **A record with no linkage is not done.**
7. A decision you still need → `DECISION NEEDED` at the top of your NOW file, quoting the two contradicting lines. The Lead answers there within the hour. The owner is never the messenger.
