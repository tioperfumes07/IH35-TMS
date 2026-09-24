# NOW — CURSOR — E22 — FUEL: CREATE THE EXPENSE ONLY. QUICKBOOKS FLOW.
2026-09-23 6:45 PM CT (23:45 UTC) — OWNER RULING. Supersedes E21.

## THE RULING, IN THE OWNER'S WORDS
"IT SHOULD ONLY BE CREATING THE EXPENSE, LIKE IN QUICKBOOKS, AND WE MATCH IN
BANKING."

## WHAT YOU ARE DOING WRONG
You are hand-writing a fuel journal entry:
    DR 5000 Fuel & Diesel      774.55
    CR 1090 Undeposited Funds  774.55
    memo: "Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel..."
Two things are wrong and the second is the real one.
  1. 1090 Undeposited Funds is where CUSTOMER RECEIPTS sit before deposit.
     It is the wrong direction entirely — you credited an incoming-cash
     account to pay for diesel.
  2. **You should not be writing a fuel JE at all.** A bare "Fuel event
     <uuid>" memo is the signature of a bespoke poster. QuickBooks does not
     journal a fuel purchase. It records an EXPENSE against a payment
     account, and the bank feed matches it later.

## WHAT TO DO INSTEAD — ONE THING
**CREATE THE EXPENSE. NOTHING ELSE.**
Use the canonical expense writer — the same path the app uses when a person
enters an expense. It already posts the GL correctly. Do not write a JE, do
not pick GL accounts by hand, do not invent a routing engine.

On the expense record set:
  - account / category : 5000 Fuel & Diesel
  - PAYMENT ACCOUNT    : the card the fuel was actually bought on
                           Relay      -> 1295 Relay Fuel Wallet
                           Dreamline  -> 2510 Dreamline Diesel Card Payable
                           Amex       -> 2500 Amex Credit Card Payable
                         If the provider is not on the fuel transaction,
                         STOP that row and report it. Never default to 1090.
  - load_id, driver, unit, gallons, date, vendor/location from the source
  - memo: human first — "Fuel · load 13511 · Infante Corona · T176 ·
    159.168 gal · Relay". Never a bare UUID.

The GL then falls out of the expense engine on its own. Banking matches the
card transaction against that expense later, exactly like QuickBooks.

## BANKING — DO NOT TOUCH IT
banking.bank_transactions stays at 1133 for USMCA, EXACT, every single day.
You never create, delete or modify a bank row. Matching happens in the
Banking module against rows that are already there. If a fuel expense has no
bank row to match yet, that is correct and expected — it matches when the
card statement lands.

## FIX WHAT IS ALREADY POSTED
Ten fuel JEs are live, all crediting 1090, total 7,250.20. Reverse them
through the existing reversal engine — void, never delete — and re-create
them as EXPENSES through the canonical writer. No new GL math.
GL 1090 currently reads +8,666.30 on 17 lines. After the fix it must hold
only genuine undeposited customer receipts.

## THE SAME RULE APPLIES TO EVERY COST YOU FEED
Expenses, tolls, lumper, repairs, scale fees — all of them. Create the
EXPENSE with its payment account. Never hand-write a journal entry. If a
step has no engine in docs/manuals/capability-registry.json, that is a
FINDING to post, not a function to write.

## WHAT IS CORRECT — UNCHANGED, DO NOT DISTURB
Trial balance nets to EXACTLY 0.00.
  1100 A/R +16,450.00 · 4000 Line-haul -16,450.00 ·
  2150 Factoring Advance -16,450.00 (gross, ASC 860 secured borrowing,
  A/R stays on books) · 1230 Factoring Reserves +239.92 ·
  6400 Factoring Fees +293.58 · 1150 Unbilled Revenue 0.00 on 14 lines
  (two-event latch opening and closing correctly) ·
  banking.bank_transactions 1133 EXACT
W.O. normalization, the Watco reserve legs as two offsetting movements, and
the carry-forward settlement ledger are all correct. Keep them.

## RESUME CONDITIONS
  1. Fuel creates an EXPENSE through the canonical writer, payment account
     = the real card, never 1090, never a hand-written JE.
  2. The 10 existing fuel JEs reversed and re-created as expenses.
  3. Memos name the load and the party.
Paste the corrected GL by account, then run 8/14 -> 9/21 continuously.

## FEED DAY LOG (ROUND 145.2)
(ROUND 142.5)
2026-09-23 9:36 PM CT (2026-09-24 02:36Z) · NULL STAMP FIXED · FAC-2026-00027 faro_inv=34 purchase=$1,000.00 · root=create→/advance race (stamp ran AFTER advance in feed-day-828) · closed=create-time faro_* fields in factoring-advances.routes + stampFaroMeta BEFORE /advance fail-closed · REMEASURE rows=30 gross=$83,775.00 stamped=30/30 · 8/28 CLOSED · opening 8/31
2026-09-23 9:45 PM CT (2026-09-24 02:45Z) · 8/31 RED 2/4 $6,500 fed (41+38) · STOPPED inv39 Big G PO3965 + inv40 DGL EXPORT L-43416 (recon UNMATCHED) · stamped live N/N · opening 9/1

2026-09-23 9:57 PM CT (2026-09-24 02:57Z) · 08/28 ESTABLISHED: day COMPLETE 8/8 inv $26,900 stamped — NOT short on the day. Cum through 8/28=$83,775 vs control $95,075 SHORT $11,300 = STOPPED prior inv15 DARDINI $3600 + inv16 MPH $3800 + inv18 DARDINI $3900 (WO exceptions). 8/31 rows exist while cum behind control = out-of-order on CUM only; day 8/28 itself closed on count/gross/stamp.
2026-09-23 9:57 PM CT (2026-09-24 02:57Z) · GATE 8/28/26: #1-6+8-12 PASS · #7 WIRE_LEGS RED (expected net adv $26,083 live payments $0 / 0 legs — feed posts factoring advance JE only; no accounting.payments wire legs yet; Banking match later). Day does NOT close on #7. Holding successor until wire-leg path ruled / built. Assert 13-15 not in this gate build (12 assertions).
2026-09-23 9:57 PM CT (2026-09-24 02:57Z) · LINKAGE 145.2: BATCH=feed-day-810..813 early (21:49–22:52Z) loads 13508/13510/13511/13512/13514 — 10 fuel rows NULL driver+unit. Corrected inherit-from-load: fuel 63/63 trailer+driver+unit · expenses 118/118 trailer+driver · diesel expenses 63 linked source_fuel_transaction_id · loads 32/32 factoring_company_vendor_id=Faro. Writer: expense API inherits trailer from load assignment + accepts source_fuel_transaction_id; feed-day-831+ family stamps trailer+source_fuel+Faro vendor at creation.
2026-09-23 9:57 PM CT (2026-09-24 02:57Z) · LIVE totals: advances 32 non-void / $90,275 / stamped 32/32 · latest day 8/31 partial 2/4 $6,500 (39+40 STOPPED UNMATCHED). NEXT: wire legs for gate GREEN then 9/1→09/05.
2026-09-23 10:15 PM CT (2026-09-24 03:15Z) · GATE 8/28/26 GREEN all 12 · #7 WIRE_LEGS fixed: was looking at accounting.payments (0 forever; customer→Faro later). Correct = factoring_advance JE 1090 DR cash legs. Live 8×$26,083.00 EXACT = net adv. No new GL math. banking.bank_transactions 1133 EXACT. Day CLOSES. Opening 9/1.
2026-09-23 10:15 PM CT (2026-09-24 03:15Z) · LINKAGE 145.2 LIVE: fuel 63/63 trailer+driver+unit · expenses 118/118 trailer+driver · diesel 63/63 source_fuel_transaction_id · loads 32/32 Faro vendor · advances 33/$90,894.24 stamped 33/33 (8/31 +1 vs prior log). Writer hardened at create.
2026-09-23 10:18 PM CT (2026-09-24 03:18Z) · GATE 8/28/26 GREEN 15/15 · #7=factoring_advance 1090 DR cash legs $26,083/8 · #14=non-factoring 1090 DR $0 (Faro wire cash in 1090 is intentional until Banking match; match never re-posts) · bank_tx 1133 EXACT · Day CLOSES. Opening 9/1.
2026-09-23 10:31 PM CT (2026-09-24 03:31Z) · FEED 9/1/26 GREEN 4/4 · inv44→13561 $3,450 FAC-00034 · inv42→13559 $3,800 FAC-00035 · inv37→13551 $3,000 FAC-00036 · inv43→13560 $4,400 FAC-00037 · day $14,650 net adv $14,200.50 stamped 4/4 · fuel expenses carry trailer+source_fuel at create · GATE 9/1/26 GREEN 15/15 · bank_tx 1133 · Opening 9/3.
2026-09-23 10:35 PM CT (2026-09-24 03:35Z) · 9/3 SCOPED: 6 inv mapped AT 13562/64/69/66/67 + 13563 Hawkeye STOPPED (seed linehaul $500 ≠ Faro $600 UNMATCHED). Building feed-day-903 next turn. PR #22517.
2026-09-23 10:44 PM CT (2026-09-24 03:44Z) · FEED 9/3/26 PARTIAL 4/6 $8,100 · FAC-00038..00041 (47/51/45/48) · STOPPED inv46 Hawkeye $600≠$500 + inv49 AB Global Faro PO 61409≠AT WO 61417 · GATE RED count/gross (expected) · #14 $820.16 = CC-1 ROUND 145.1 fuel JE CR-path on 1090 (not Cursor feed) · linkage 13569 unit stamped · Opening 9/4 only after STOPPED ruled OR continue 8/31-style.
