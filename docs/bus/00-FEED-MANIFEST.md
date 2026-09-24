# 00-FEED-MANIFEST — ALL 23 FARO PURCHASE DAYS — CURSOR'S COMPLETE ORDERS
Built by Claude Lead 2026-09-23 6:55 PM CT (23:55 UTC) from the Faro
PURCHASE REPORT ALL + PAYMENTS-TO-USMCA-FROM-FARO. Totals verified:
89 invoices, $311,587.00 — exact match to the owner-locked control in
data/reconciliation/usmca-reconciliation-closed-2026-09-22.json.

## YOU NEVER COME BACK TO LEAD FOR THE NEXT DAY. IT IS ALL HERE.
Feed every day below, in order, without pausing. A finished day is NOT a
stopping point: reconcile it, and if green OPEN THE NEXT ONE IN THE SAME
TURN. Your report's last line names the day you have ALREADY started.

## STOP ONLY ON THESE SIX. NOTHING ELSE PAUSES YOU.
1. W.O. normalization yields 0 matches or more than 1 for a Faro PO.
2. A settlement's net_pay will not equal the signed TOTAL DUE to the cent.
3. verify-alwaystrack-parity fails for the day.
4. banking.bank_transactions USMCA != 1133.
5. JE debits != credits.
6. A chain step has no engine in docs/manuals/capability-registry.json.
On any of these: post the exception, feed the rest of that day's unaffected
invoices, hold. Never guess. Never skip silently.
Not a merge, not a guard, not a Lead message, not a finished day pauses you.

## THE CHAIN, PER LOAD, THROUGH THE APP'S OWN ENGINES
load -> load_stops -> proforma invoice -> invoice -> driver bill ->
expenses -> fuel -> settlement (only when its full load set is fed) ->
factoring advance LAST.
createLoadWithFullSideEffects. COSTS ARE EXPENSES through the canonical
expense writer with the real payment account — NEVER a hand-written JE.
Fuel payment account: Relay -> 1295 Relay Fuel Wallet · Dreamline -> 2510
Dreamline Diesel Card Payable · Amex -> 2500. NEVER 1090 Undeposited Funds.
Banking matches later; you never create, delete or modify a bank row.

## W.O. MATCHING LAW
Normalize both sides: strip whitespace, strip a leading '#', strip leading
zeros, case-insensitive. Faro 1523174 == AlwaysTrack 001523174. Store the
AlwaysTrack form in customer_wo_number. NEVER match on amount.
0 or >1 matches -> STOP that invoice, feed the rest, report it.

## MEMOS
Name the load and the party: "Fuel · load 13511 · Infante Corona · T176 ·
159.168 gal · Relay". Never a bare UUID.

## SETTLEMENTS
A settlement posts ONLY when every load on its signed document is fed AND
its net_pay ties to the signed TOTAL DUE to the cent. Carry open
settlements forward across days — that is normal. Paste the carry-forward
ledger every day. Currently open:
  5769 needs 13498, 13508 · 5771 needs 13504, 13510 ·
  5772 needs 13512, 13513 · 5773 needs 13497, 13511

## THE 5 SELF-CARRIED INVOICES — NOT IN THE 89. FEED AT THE END.
009 FLS · 010 Supply Chain Mgmt · 026 IM Specialized · 055/13555 2EMS ·
074/13593 Alligator. $12,592.40 total, factoring_status='not_factored',
$0.00 paid on any. 13593 Alligator is NOT invoiceable — deadhead, its
expenses stay in the P&L, no invoice. These are exactly the 5 gaps in
Faro's invoice numbering (9, 10, 26, 55, 74).

## FINAL CONTROL AT 9/21 — ALL OF THESE, EXACTLY
purchases $311,587.00 · net advance $302,019.36 · receipts $12,825.00 ·
AR $298,762.00 · 89 invoices · banking.bank_transactions 1133 EVERY DAY.
Identity that must hold: purchases - receipts = AR.

## FARO INVOICE NUMBERS ARE NOT CHRONOLOGICAL.
inv 1 falls on 8/11 while inv 2 and 3 fall on 8/10. THE PURCHASE DATE IS
THE DAY. Never sort or select by invoice number.

## ONE MALFORMED ROW — 9/8 REFRIGERX
Faro's export has Inv# and PO TRANSPOSED on that row. The invoice is
UNNUMBERED; its PO is 1013272-2. Do not mint an invoice called
"1013272-2". 88 numbered (1-93 less 9,10,26,55,74) + 1 unnumbered = 89.

## 9/21 SHOWS 0.00 NET ADVANCE IN THE EXPORT. IT IS STILL ADVANCED.
That is a snapshot artifact of the export, not a state. Purchased IS
advanced. 9/21 net advance is $31,783.98 and it is what closes the
cumulative to $302,019.36.

---
# THE 23 DAYS

## 8/10/26 — 2 invoice(s) — day $5,500.00 — CUM $5,500.00 — 2 invoices to date
  inv 2 · IMPACT BULK LOGISTICS LLC · PO 4483
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 0.00
    net adv 2,910.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,910.00 USMCA Wire 08/10/26
  inv 3 · NCC LOGISTICS USA INC · PO 138458
    purchase 2,500.00 · escrow 0.00 · cash rsv 30.90 · discount 37.50 · fees 10.00
    net adv 2,415.00 · receipts 2,500.00 · sch fee 6.60
    PAY: wire 2,415.00 USMCA Wire 08/10/26

## 8/11/26 — 1 invoice(s) — day $3,600.00 — CUM $9,100.00 — 3 invoices to date
  inv 1 · REHMANN TRANSPORTATION CORP. · PO 1523174
    purchase 3,600.00 · escrow 54.00 · cash rsv 0.00 · discount 54.00 · fees 10.00
    net adv 3,482.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,482.00 Wire USMCA 08/11/26

## 8/12/26 — 1 invoice(s) — day $1,700.00 — CUM $10,800.00 — 4 invoices to date
  inv 4 · Watco Supply Chain Services, LLC · PO 2239480
    purchase 1,700.00 · escrow 0.00 · cash rsv 25.50 · discount 25.50 · fees 10.00
    net adv 1,639.00 · receipts 1,700.00 · sch fee 0.00
    PAY: THREE ROWS: wire 1,639.00 + Internal Transfer OUT 1,649.00 + Deposit IN 1,649.00. The two 1,649.00 legs OFFSET. Net cash = 1,639.00. Book both reserve legs individually, never netted, never as advance.

## 8/13/26 — 3 invoice(s) — day $5,650.00 — CUM $16,450.00 — 7 invoices to date
  inv 5 · Magna Transport Solutions LLC · PO 130823895
    purchase 2,700.00 · escrow 40.50 · cash rsv 0.00 · discount 40.50 · fees 0.00
    net adv 2,619.00 · receipts 0.00 · sch fee 0.00
    PAY: TWO LEGS: wire 819.00 + Faro Internal Transfer 1,800.00 = 2,619.00
  inv 6 · BV LOGISTICS INC · PO 20495
    purchase 2,600.00 · escrow 39.00 · cash rsv 0.00 · discount 39.00 · fees 10.00
    net adv 2,512.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,512.00
  inv 7 · ITS LOGISTICS, LLC · PO 68747
    purchase 350.00 · escrow 0.00 · cash rsv 5.02 · discount 5.25 · fees 0.00
    net adv 339.50 · receipts 350.00 · sch fee 0.23
    PAY: wire 339.50

## 8/14/26 — 4 invoice(s) — day $10,125.00 — CUM $26,575.00 — 11 invoices to date
  inv 11 · Sethmar Transportation Inc · PO 477079
    purchase 700.00 · escrow 0.00 · cash rsv 9.11 · discount 10.50 · fees 0.00
    net adv 679.00 · receipts 700.00 · sch fee 1.39
    PAY: wire 679.00
  inv 8 · FLS Transport Inc. · PO 5772267
    purchase 525.00 · escrow 0.00 · cash rsv 7.88 · discount 7.88 · fees 0.00
    net adv 509.24 · receipts 525.00 · sch fee 0.00
    PAY: wire 509.24
  inv 13 · S E Mares Forwarding Service LLC · PO SEM66465
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: FARO INTERNAL TRANSFER 4,753.00 'Transfer to IH35 neg res 08/14/26' — not a wire
  inv 12 · CTS XPRESS LLC · PO 15418
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 10.00
    net adv 3,870.00 · receipts 0.00 · sch fee 0.00
    PAY: TWO LEGS: wire 3,182.00 + Faro Internal Transfer 688.00 = 3,870.00. BOOK BOTH.

## 8/17/26 — 2 invoice(s) — day $7,100.00 — CUM $33,675.00 — 13 invoices to date
  inv 14 · CORE LOGISTICS BROKERAGE · PO 31496-65096
    purchase 3,500.00 · escrow 52.50 · cash rsv 0.00 · discount 52.50 · fees 0.00
    net adv 3,395.00 · receipts 3,250.00 · sch fee 0.00
    PAY: wire 3,395.00
  inv 15 · DARDINI LLC · PO 154100
    purchase 3,600.00 · escrow 54.00 · cash rsv 0.00 · discount 54.00 · fees 10.00
    net adv 3,482.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,482.00

## 8/18/26 — 1 invoice(s) — day $3,800.00 — CUM $37,475.00 — 14 invoices to date
  inv 16 · MPH CARRIER SERVICES INC · PO MPHC261334
    purchase 3,800.00 · escrow 0.00 · cash rsv 57.00 · discount 57.00 · fees 10.00
    net adv 3,676.00 · receipts 3,800.00 · sch fee 0.00
    PAY: wire 3,676.00

## 8/19/26 — 2 invoice(s) — day $6,600.00 — CUM $44,075.00 — 16 invoices to date
  inv 17 · SAJACKS FREIGHT INC · PO 9020844
    purchase 3,100.00 · escrow 46.50 · cash rsv 0.00 · discount 46.50 · fees 0.00
    net adv 3,007.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,007.00
  inv 19 · J RAYL TRANSPORT INC · PO 251839
    purchase 3,500.00 · escrow 52.50 · cash rsv 0.00 · discount 52.50 · fees 10.00
    net adv 3,385.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,385.00

## 8/21/26 — 5 invoice(s) — day $16,900.00 — CUM $60,975.00 — 21 invoices to date
  inv 23 · S E Mares Forwarding Service LLC · PO SEM66495
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 20 · DEL-CAN LOGISTICS, LLC. · PO 38484
    purchase 1,000.00 · escrow 15.00 · cash rsv 0.00 · discount 15.00 · fees 0.00
    net adv 970.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 970.00
  inv 24 · Prodigee Logistics LLC · PO 29852
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 10.00
    net adv 3,870.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,870.00
  inv 22 · DEL-CAN LOGISTICS, LLC. · PO 38463
    purchase 3,100.00 · escrow 46.50 · cash rsv 0.00 · discount 46.50 · fees 0.00
    net adv 3,007.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,007.00
  inv 18 · DARDINI LLC · PO 154067
    purchase 3,900.00 · escrow 58.50 · cash rsv 0.00 · discount 58.50 · fees 0.00
    net adv 3,783.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,783.00

## 8/24/26 — 2 invoice(s) — day $4,100.00 — CUM $65,075.00 — 23 invoices to date
  inv 21 · OSTT LOGISTICS LLC · PO 119922
    purchase 3,300.00 · escrow 49.50 · cash rsv 0.00 · discount 49.50 · fees 10.00
    net adv 3,191.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,191.00
  inv 25 · Jericho Freight LLC · PO 21148
    purchase 800.00 · escrow 12.00 · cash rsv 0.00 · discount 12.00 · fees 0.00
    net adv 776.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 776.00

## 8/26/26 — 2 invoice(s) — day $3,100.00 — CUM $68,175.00 — 25 invoices to date
  inv 28 · Hawkeye Transportation Services · PO 66006
    purchase 600.00 · escrow 9.00 · cash rsv 0.00 · discount 9.00 · fees 0.00
    net adv 582.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 582.00
  inv 27 · PFL LOGISTICS LLC · PO LD88719
    purchase 2,500.00 · escrow 37.50 · cash rsv 0.00 · discount 37.50 · fees 10.00
    net adv 2,415.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,415.00

## 8/28/26 — 8 invoice(s) — day $26,900.00 — CUM $95,075.00 — 33 invoices to date
  inv 33 · MPH CARRIER SERVICES INC · PO 1000052
    purchase 2,300.00 · escrow 34.50 · cash rsv 0.00 · discount 34.50 · fees 10.00
    net adv 2,221.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,221.00
  inv 36 · HUMMINGBIRD LOGISTIX LLC · PO 488
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 0.00
    net adv 3,880.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,880.00
  inv 35 · S E Mares Forwarding Service LLC · PO SMX14603
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 31 · JERUE LOGISTICS SOLUTIONS · PO 20348564
    purchase 1,100.00 · escrow 16.50 · cash rsv 0.00 · discount 16.50 · fees 0.00
    net adv 1,067.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 1,067.00
  inv 34 · R2X LLC · PO 314828
    purchase 1,000.00 · escrow 15.00 · cash rsv 0.00 · discount 15.00 · fees 0.00
    net adv 970.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 970.00
  inv 29 · Simple Logistics Solutions · PO 196203
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 0.00
    net adv 3,880.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,880.00
  inv 32 · John J Jerue Truck Broker Inc. · PO 20348480
    purchase 4,800.00 · escrow 72.00 · cash rsv 0.00 · discount 72.00 · fees 0.00
    net adv 4,656.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,656.00
  inv 30 · John J Jerue Truck Broker Inc. · PO 20348212
    purchase 4,800.00 · escrow 72.00 · cash rsv 0.00 · discount 72.00 · fees 0.00
    net adv 4,656.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,656.00

## 8/31/26 — 4 invoice(s) — day $13,900.00 — CUM $108,975.00 — 37 invoices to date
  inv 41 · AB GLOBAL LOGISTICS INC · PO 61471
    purchase 3,500.00 · escrow 52.50 · cash rsv 0.00 · discount 52.50 · fees 10.00
    net adv 3,385.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,385.00
  inv 39 · BIG G LOGISTICS LLC · PO 3965
    purchase 3,500.00 · escrow 52.50 · cash rsv 0.00 · discount 52.50 · fees 0.00
    net adv 3,395.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,395.00
  inv 40 · DGL EXPORT INC · PO L-43416
    purchase 3,900.00 · escrow 58.50 · cash rsv 0.00 · discount 58.50 · fees 0.00
    net adv 3,783.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,783.00
  inv 38 · DEL-CAN LOGISTICS, LLC. · PO 38642
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 0.00
    net adv 2,910.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,910.00

## 9/1/26 — 4 invoice(s) — day $14,650.00 — CUM $123,625.00 — 41 invoices to date
  inv 44 · Refrigerx Transportation LLC · PO 1013241
    purchase 3,450.00 · escrow 51.75 · cash rsv 0.00 · discount 51.75 · fees 0.00
    net adv 3,346.50 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,346.50
  inv 42 · SERVICE FIRST LOGISTICS INCORPORATED · PO 131252703
    purchase 3,800.00 · escrow 57.00 · cash rsv 0.00 · discount 57.00 · fees 10.00
    net adv 3,676.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,676.00
  inv 37 · ARMSTRONG TRANSPORT GROUP INC · PO 4613473-1
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 0.00
    net adv 2,910.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,910.00
  inv 43 · SHEERTRANS SOLUTIONS LLC · PO 131060693
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,268.00

## 9/3/26 — 6 invoice(s) — day $10,800.00 — CUM $134,425.00 — 47 invoices to date
  inv 47 · PREMIUM EXPRESS LOGISTICS · PO 18258
    purchase 1,000.00 · escrow 15.00 · cash rsv 0.00 · discount 15.00 · fees 0.00
    net adv 970.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 970.00
  inv 51 · ARMSTRONG TRANSPORT GROUP INC · PO 4631956-1
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 10.00
    net adv 2,900.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,900.00
  inv 46 · Hawkeye Transportation Services · PO 66174
    purchase 600.00 · escrow 9.00 · cash rsv 0.00 · discount 9.00 · fees 0.00
    net adv 582.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 582.00
  inv 45 · ARMSTRONG TRANSPORT GROUP INC · PO 4631936-1
    purchase 3,000.00 · escrow 45.00 · cash rsv 0.00 · discount 45.00 · fees 0.00
    net adv 2,910.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,910.00
  inv 48 · Brock LLC · PO 804689
    purchase 1,100.00 · escrow 16.50 · cash rsv 0.00 · discount 16.50 · fees 0.00
    net adv 1,067.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 1,067.00
  inv 49 · AB GLOBAL LOGISTICS INC · PO 61409
    purchase 2,100.00 · escrow 31.50 · cash rsv 0.00 · discount 31.50 · fees 0.00
    net adv 2,037.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,037.00

## 9/4/26 — 4 invoice(s) — day $17,315.00 — CUM $151,740.00 — 51 invoices to date
  inv 50 · AB GLOBAL LOGISTICS INC · PO 61461
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 10.00
    net adv 3,870.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,870.00
  inv 53 · S E Mares Forwarding Service LLC · PO SMX14611
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 54 · ARMSTRONG TRANSPORT GROUP INC · PO #4636360-1
    purchase 2,300.00 · escrow 34.50 · cash rsv 0.00 · discount 34.50 · fees 0.00
    net adv 2,231.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,231.00 — PO carries a leading '#', normalize it off
  inv 52 · XPR LOGISTICS LLC · PO 2501086
    purchase 6,115.00 · escrow 91.73 · cash rsv 0.00 · discount 91.73 · fees 0.00
    net adv 5,931.54 · receipts 0.00 · sch fee 0.00
    PAY: wire 5,931.54

## 9/8/26 — 6 invoice(s) — day $23,910.00 — CUM $175,650.00 — 57 invoices to date
  inv 57 · ES Logistics · PO ES-6883
    purchase 2,200.00 · escrow 33.00 · cash rsv 0.00 · discount 33.00 · fees 0.00
    net adv 2,134.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,134.00
  inv 59 · ARMSTRONG TRANSPORT GROUP INC · PO 4619442-1
    purchase 3,500.00 · escrow 52.50 · cash rsv 0.00 · discount 52.50 · fees 10.00
    net adv 3,385.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,385.00
  inv 56 · ES Logistics · PO ES6884
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,268.00
  inv 60 · S E Mares Forwarding Service LLC · PO SEM66511
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 58 · Refrigerx Transportation LLC · PO 1013406
    purchase 3,700.00 · escrow 55.50 · cash rsv 0.00 · discount 55.50 · fees 0.00
    net adv 3,589.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,589.00
  inv UNNUMBERED · Refrigerx Transportation LLC · PO 1013272-2
    purchase 5,210.00 · escrow 78.15 · cash rsv 0.00 · discount 78.15 · fees 0.00
    net adv 5,053.70 · receipts 0.00 · sch fee 0.00
    PAY: wire 5,053.70 — FARO EXPORT HAS Inv#/PO TRANSPOSED ON THIS ROW. True invoice number is UNNUMBERED; PO is 1013272-2. DO NOT mint an invoice called '1013272-2'.

## 9/10/26 — 2 invoice(s) — day $3,100.00 — CUM $178,750.00 — 59 invoices to date
  inv 62 · Tennessee Steel Haulers LLC · PO 2160672
    purchase 1,000.00 · escrow 15.00 · cash rsv 0.00 · discount 15.00 · fees 0.00
    net adv 970.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 970.00
  inv 61 · DIRECT CONNECT LOGISTIX LLC · PO 6492969
    purchase 2,100.00 · escrow 31.50 · cash rsv 0.00 · discount 31.50 · fees 10.00
    net adv 2,027.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 2,027.00

## 9/11/26 — 7 invoice(s) — day $33,400.00 — CUM $212,150.00 — 66 invoices to date
  inv 64 · S E Mares Forwarding Service LLC · PO SEM66514
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 10.00
    net adv 4,743.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,743.00
  inv 63 · TRIPLE T TRANSPORT INC · PO 42-1269653
    purchase 3,300.00 · escrow 49.50 · cash rsv 0.00 · discount 49.50 · fees 0.00
    net adv 3,201.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,201.00
  inv 67 · S E Mares Forwarding Service LLC · PO SMX14610
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 68 · Refrigerx Transportation LLC · PO 101333-2
    purchase 5,700.00 · escrow 85.50 · cash rsv 0.00 · discount 85.50 · fees 0.00
    net adv 5,529.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 5,529.00
  inv 69 · Kirsch Transportation Services Inc. · PO 712370
    purchase 4,150.00 · escrow 62.25 · cash rsv 0.00 · discount 62.25 · fees 0.00
    net adv 4,025.50 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,025.50
  inv 65 · Hawkeye Transportation Services · PO 66304
    purchase 6,850.00 · escrow 102.75 · cash rsv 0.00 · discount 102.75 · fees 0.00
    net adv 6,644.50 · receipts 0.00 · sch fee 0.00
    PAY: wire 6,644.50
  inv 66 · MODE TRANSPORTATION · PO 16430047
    purchase 3,600.00 · escrow 54.00 · cash rsv 0.00 · discount 54.00 · fees 0.00
    net adv 3,492.00 · receipts 0.00 · sch fee 0.00
    PAY: TWO DATES: wire 3,201.00 on 9/11 + wire 291.00 on 9/17 = 3,492.00. BOOK BOTH.

## 9/14/26 — 7 invoice(s) — day $30,770.00 — CUM $242,920.00 — 73 invoices to date
  inv 72 · ROAR LOGISTICS INC · PO 1650646
    purchase 3,700.00 · escrow 55.50 · cash rsv 0.00 · discount 55.50 · fees 0.00
    net adv 3,589.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,589.00
  inv 71 · AB GLOBAL LOGISTICS INC · PO 61620
    purchase 5,500.00 · escrow 82.50 · cash rsv 0.00 · discount 82.50 · fees 10.00
    net adv 5,325.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 5,325.00
  inv 76 · S E Mares Forwarding Service LLC · PO SEM66525
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 70 · Key Global Logistics, Inc · PO 131527406
    purchase 4,120.00 · escrow 61.80 · cash rsv 0.00 · discount 61.80 · fees 0.00
    net adv 3,996.40 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,996.40
  inv 73 · ES Logistics · PO ES6888
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,268.00
  inv 77 · S E Mares Forwarding Service LLC · PO SEM66526
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 75 · DAFFINSON LOGISTICS LLC · PO 14861
    purchase 3,250.00 · escrow 48.75 · cash rsv 0.00 · discount 48.75 · fees 0.00
    net adv 3,152.50 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,152.50

## 9/17/26 — 2 invoice(s) — day $7,600.00 — CUM $250,520.00 — 75 invoices to date
  inv 79 · ARMSTRONG TRANSPORT GROUP INC · PO 4668962-1
    purchase 3,600.00 · escrow 54.00 · cash rsv 0.00 · discount 54.00 · fees 0.00
    net adv 3,492.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,492.00
  inv 78 · SUNTECK TRANSPORT CO., LLC · PO 16442687
    purchase 4,000.00 · escrow 60.00 · cash rsv 0.00 · discount 60.00 · fees 10.00
    net adv 3,870.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,870.00

## 9/18/26 — 7 invoice(s) — day $28,300.00 — CUM $278,820.00 — 82 invoices to date
  inv 86 · S E Mares Forwarding Service LLC · PO SMX14651
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 82 · S E Mares Forwarding Service LLC · PO SEM66528
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 10.00
    net adv 4,743.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,743.00
  inv 80 · Whitehorse Freight · PO 290544
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,268.00
  inv 85 · FUZE LOGISTICS SERVICES USA, INC. · PO MTL-624482
    purchase 1,100.00 · escrow 16.50 · cash rsv 0.00 · discount 16.50 · fees 0.00
    net adv 1,067.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 1,067.00
  inv 81 · RLS DISTRIBUTION INC · PO 1233617
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,753.00
  inv 84 · Refrigerx Transportation LLC · PO 1013634
    purchase 3,700.00 · escrow 55.50 · cash rsv 0.00 · discount 55.50 · fees 0.00
    net adv 3,589.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 3,589.00
  inv 83 · PLS LOGISTICS SERVICES LLC · PO 32346062
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: wire 4,268.00

## 9/21/26 — 7 invoice(s) — day $32,767.00 — CUM $311,587.00 — 89 invoices to date
  inv 88 · IND CIRCLE LOGISTICS, INC · PO 2584270
    purchase 5,217.00 · escrow 78.26 · cash rsv 0.00 · discount 78.26 · fees 0.00
    net adv 5,060.48 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED. Export shows 0.00 net adv — that is a snapshot artifact. Purchased = advanced.
  inv 87 · S E Mares Forwarding Service LLC · PO SEM66538
    purchase 4,900.00 · escrow 73.50 · cash rsv 0.00 · discount 73.50 · fees 0.00
    net adv 4,753.00 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED — see note above
  inv 93 · Refrigerx Transportation LLC · PO 1013714
    purchase 3,450.00 · escrow 51.75 · cash rsv 0.00 · discount 51.75 · fees 0.00
    net adv 3,346.50 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED
  inv 92 · Refrigerx Transportation LLC · PO 1013583-2
    purchase 5,700.00 · escrow 85.50 · cash rsv 0.00 · discount 85.50 · fees 0.00
    net adv 5,529.00 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED. Load 13613 — AlwaysTrack W.O. is 1013583-2; our app had PO 4504493857 and NULL W.O. The refeed fixes it.
  inv 89 · ES Logistics · PO ES6900
    purchase 4,400.00 · escrow 66.00 · cash rsv 0.00 · discount 66.00 · fees 0.00
    net adv 4,268.00 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED
  inv 90 · Refrigerx Transportation LLC · PO 1013737
    purchase 5,900.00 · escrow 88.50 · cash rsv 0.00 · discount 88.50 · fees 0.00
    net adv 5,723.00 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED
  inv 91 · Refrigerx Transportation LLC · PO 1013707
    purchase 3,200.00 · escrow 48.00 · cash rsv 0.00 · discount 48.00 · fees 0.00
    net adv 3,104.00 · receipts 0.00 · sch fee 0.00
    PAY: ADVANCED

TOTALS CHECK: 89 invoices, purchases $311,587.00
