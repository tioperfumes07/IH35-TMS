# IH35-TMS / USMCA — RECONCILIATION AND FEED — READ THIS FIRST
# Assembled 2026-09-23 by Claude Lead, for the session that comes after the purge.

If you are a new session: everything you need is in this folder. Do not re-derive any of it.
Do not ask the owner for a file. Do not re-measure a number that is written down here with its
source named. The owner has said, plainly, that being asked again is what stops progress.

## WHAT THIS FOLDER IS
The purge deletes every created transaction in USMCA. It does NOT delete the chart of accounts,
drivers, units, customers, vendors, banking or the item catalog. After the purge, the app is
re-fed from the AlwaysTrack settlement documents and the Faro reports, day by day.
This folder holds the engines that do the feeding, the controls that prove it, the source
documents they read, and the reasoning behind every ruling.

## THE FIVE FACTS THAT ANCHOR EVERYTHING
1. USMCA only. operating_company_id `5c854333-6ea5-4faa-af31-67cb272fef80`.
   TRANSPORTATION and TRUCKING are frozen — never read, write or report on them.
2. Production is Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`.
   Reads require `SET LOCAL app.bypass_rls = 'lucia'` inside one transaction.
3. Every USMCA record is REAL unless it carries `is_sample_data = true`. Never write a test,
   sample or demo record into USMCA — not even to prove something works.
4. We are a QuickBooks CLONE. Two layers, never one: the CHART OF ACCOUNTS is coarse; the ITEMS
   carry the detail and map to accounts. Detail lives in the item, rollup lives in the account.
5. QuickBooks write-back is OFF forever. The live QBO connection is READ-ONLY reference.

## THE NUMBERS THAT ARE CLOSED. DO NOT RE-DERIVE THEM.
From Faro's own exports (03-SOURCE-DOCUMENTS), every one tying to the cent:
  purchases            311,587.00
  receipts              12,825.00
  A/R identity         298,762.00   = purchases - receipts, exact
  escrow reserve         4,530.19
  discount fees          4,673.82
  wire fees                220.00   (flat 10.00 on 19 invoices)
  schedule fees              8.22
  invoices in the book          89
  ADVANCE RATE              0.9700  exact; min 0.9641 on a rounding
  FUNDING IDENTITY: face - escrow - cash reserve - discount - fees - dispatch - schedule fee
                    = net advance.  HOLDS ON 82 OF 82 FUNDED INVOICES.
  7 invoices purchased but NOT YET FUNDED: 88, 87, 93, 92, 89, 90, 91
  CONFIRMED CUSTOMER SHORT-PAYS: ZERO. Chargebacks: ZERO.
  One partial: invoice 14 / load 13521, face 3,500.00, receipts 3,250.00, open 250.00.
  82 invoices, 298,512.00 of face, have never been touched by a debtor.

From the 117 AlwaysTrack settlement documents:
  59 company docs + 58 driver docs · 124 loads on BOTH sides · zero orphans
  355 stops · 353 with a facility name · 227 with leg miles
  124 of 124 loads carry a delivery departure date and a named consignee

## THE ENGINES (01-ENGINES) — ALL EXIT 0
  parse_settlements.py        the 117 documents -> parsed.json. 124 loads, both sides joined.
  build_feed_input.py         parsed.json -> feed_input.json. 124 loads, 1,165 ITEM lines.
                              Every line carries item | qty | uom | rate | amount, and the build
                              REFUSES to write unless qty x rate reconstructs the amount.
  parse_rate_confirmations.py 19 broker PDFs -> rate_confirmations.json. 15 parse, every one
                              sums to its own printed total. Five broker layouts.
  measure_faro_shortpay.py    separates ADVANCE (financing) from FEES from SHORT-PAY (deduction).
  build_day_control.py        the revenue control from Faro's reports.
  build_settlement_control.py the cost control from the 117 documents.

## THE GATES (02-CONTROLS-AND-GATES)
  verify-feed-day.mjs   revenue gate. Six money columns + invoice-number identity both ways.
  verify-feed-load.mjs  cost gate. 11 money columns, 3 counts, 2 stop-quality checks, and it
                        enforces THREE POSTING DESTINATIONS that dollars alone cannot catch:
                          cash_advance -> bill_payment
                          escrow       -> driver_escrow_liability
                          admin_fee    -> income
                        The feeder must DECLARE where it posted each. Silence fails.
  Both fail closed with no DATABASE_URL. Both have selftests with planted mutations.

## THE LAWS YOU WILL OTHERWISE GET WRONG — each cost a correction to learn
  - LINE HAUL IS NOT qty x rate. The customer is billed a CONTRACTED TOTAL; the per-mile figure
    printed on a settlement is DERIVED (amount / miles, 3dp) and never reconstructs. Driver CPM
    and fuel cost-per-gallon ARE real rates and do reconstruct. A contracted price and a rate are
    different things.
  - NOT EVERYTHING WE ARE PAID IS LINE HAUL. Brokers pay accessorials separately: tracking /
    MacroPoint, on-time pickup appointment, on-time delivery appointment, tarp. One confirmation
    is 76% line haul and 24% accessorial. Billing it all as line haul loses the revenue detail.
  - DEF, REEFER FUEL AND WASHOUT ARE ITEMS, NOT ACCOUNTS. The live QuickBooks file has three
    fuel ITEMS under one category and no DEF or reefer account. Accounts 5010, 5160, 5170 are
    retired/never created. A part is an ITEM. This was ruled the wrong way once — do not repeat it.
  - CASH ADVANCES ARE BILL PAYMENTS, dated when the money left. Not deductions, not expenses.
  - ESCROW FOR CLAIMS is a driver escrow LIABILITY. Not an expense.
  - ADMIN FEE is INCOME. Not a negative expense.
  - THE COMPANY VEHICLE USE FEE is INCOME — we charge the driver for using the vehicle he never
    fuels. Not a fuel expense, not an IFTA gallon. (Owner ruling, 2026-09-23.)
  - THE AGING REPORT'S `Balance` IS THE REMAINING OPEN BALANCE, NOT THE INVOICE FACE. The face
    is in PURCHASE REPORT ALL.csv. Reading Balance as face produces false anomalies. It produced
    one here, on invoice 14, and the owner caught it.
  - A GAP IS NOT A REASON. A short-pay reason comes from the debtor's remittance or the owner,
    never from arithmetic. No document means fault=unknown, account 4960.
  - AN ALREADY-COLLECTED DRIVER DEDUCTION IS NEVER REVERSED.
  - SIX REVERSAL ENGINES EXIST. A seventh must never be written.
  - BANK MATCHING IS SUGGEST-ONLY, PERMANENTLY. A GET must never write.
  - NO DIRECT INSERT INTO AN ACCOUNTING TABLE, EVER. Origin creates the document, the document is
    matched to the bank register, and the register creates nothing. MATCH IS NOT ADD.

## WHAT IS STILL OPEN — NAMED, NOT HIDDEN
  - 19 money lines, 1,571.91, have no item and were NOT guessed (06-OUTPUT/feed_input_gaps.json).
    15 lost their description in parsing and need the source PDF re-read; 4 are the Honda fee.
  - 4 rate confirmations produce no charge block: loads_5601763, 5606017, 5606138, 5647973.
  - LINE HAUL VARIANCE: feed_input.json totals 429,695.00 against the cost control's 436,415.00,
    a difference of 6,720.00 that is NOT YET EXPLAINED. The accessorials found on 2026-09-23 are
    the most likely cause. THIS IS THE NEXT THING TO CHECK. Do not feed anything until it closes.
  - The Honda fee's SIGN is unconfirmed: the four 10.00 lines appear POSITIVE in the company
    document's expense block. As a charge to the driver they should reduce his net and credit
    income. CC-3 confirms against one source PDF before the feed runs.
  - Invoice 14 / load 13521's open 250.00: partial payment or short-pay is UNKNOWN until Core
    Logistics' remittance arrives. PO 31496-65096.

## ORDER OF OPERATIONS AFTER THE PURGE
  1. Confirm the chart, drivers, units, customers, vendors, banking and the item catalog survived.
  2. Feed day 1 (2026-08-10, loads 13510 and 13508) from feed_input.json.
  3. Run all three gates. All must exit 0. If one fails, FIX THE ENGINE, never the data.
  4. Only then feed day 2. Never batch ahead of a passing gate.
  5. Re-price every provisional guard baseline ONCE, from the fed data.
