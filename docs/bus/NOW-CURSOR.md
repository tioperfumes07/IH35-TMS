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
