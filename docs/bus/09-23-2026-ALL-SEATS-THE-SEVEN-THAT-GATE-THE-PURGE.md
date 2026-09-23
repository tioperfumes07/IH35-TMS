# ALL SEATS — THE SEVEN ENGINES THAT GATE THE PURGE — 09-23-2026
# Owner: "THEN THE FOCUS SHOULD BE THOSE 7 FIRST." Nothing else is started until these land.

Nineteen engines are pending. SEVEN of them must exist before the purge, because they are the
engines that REBUILD what the purge deletes. The other twelve land after and are not to be
touched now.

## THE ASSIGNMENT — REBALANCED SO NO SEAT IS THE BOTTLENECK
Before rebalancing: CC-1 had three, CC-3 had three, CC-2 had one, CURSOR had none. That is the
bottleneck the owner has called out twice. Corrected:

  CC-1     1. STOP WRITER  (P0)         2. E6 FEED CALLERS
  CURSOR   3. ITEM + LINE SCHEMA        (lane cross from CC-1, granted below)
  CC-2     4. ADVANCE WRITER
  CC-3     5. CHART: 4 new accounts, 5010 retirement, E13-B hygiene, ITEM_KEY extractor
           6. ITEM CATALOG LOAD  (137 rows, pre-mapped — a load, not a design)
           7. ESCROW WRITER — all 80 lines
  LEAD     the gates, the controls, the feed payload, the orchestrator. DONE, see below.

## LANE CROSS — CURSOR TAKES THE ITEM + LINE SCHEMA
`catalogs.item_categories` and the item/quantity/rate/amount columns on
accounting.bill_lines, accounting.invoice_lines, the driver_finance settlement lines and the
load-cost line are CC-1 lane per docs/bus/LANES.md. They are hereby crossed to CURSOR for this
work only, same terms as the E1 cross. Reason: CC-1 cannot hold the stop writer, E6 and a
schema migration at once without becoming the bottleneck again, and CURSOR has the schema and
guard discipline and is otherwise free after E7 batch 2.
CC-1 does not touch these files while the cross is open. CURSOR posts the migration claim first.

## WHAT EACH ONE MUST DO

### 1. STOP WRITER — CC-1 — P0
Per stop: facility_name, street, city, state, zip, sequence, stop type, scheduled AND actual
arrival AND DEPARTURE, leg_miles. The departure on the final active delivery stop is what
revrec reads. Input: ~/Downloads/feed_input.json — 355 stops, 355 WITH A FACILITY NAME,
227 with leg miles, 124 of 124 loads with a delivery departure and a named consignee.
PROOF: a live load with every stop carrying facility, full address and departure time, and the
revrec evidence gate returning true on it.

### 2. E6 FEED CALLERS — CC-1
Four callers onto createLoadWithFullSideEffects. Machine caller gets a NEW system actor, never
a borrowed human user. customer_id from the document's named consignee. The appointment gate
does not apply in mode='historical_backfill'. Trailer from the document's Trlr: field.

### 3. ITEM + LINE SCHEMA — CURSOR
catalogs.item_categories. On every money line: item_id, quantity NUMERIC (3dp gallons, 1dp
miles), rate_cents, amount_cents COMPUTED, unit_of_measure, and a CHECK that refuses a row
where qty x rate != amount.
TWO THINGS THE ORCHESTRATOR PROVED, BUILD TO THEM:
  - An invoice is ONE document with MANY lines. So is a driver bill. Lines attach to a
    document; never create a document per line.
  - A driver bill is the document every driver-side movement attaches to. Load 13588 carries an
    escrow deduction and NO pay lines — the bill must still exist to hold it. Pay lines are NOT
    a precondition for creating a driver bill.

### 4. ADVANCE WRITER — CC-2
MODEL PROVEN FROM FARO'S OWN EXPORTS, do not re-derive it:
  advance = face x 0.9700 exactly.  Flat 10.00 wire fee on 19 invoices.
  face - escrow - cash reserve - discount - fees - dispatch - schedule fee = net advance.
  HOLDS ON 82 OF 82 FUNDED INVOICES. 7 purchased-not-yet-funded: 88, 87, 93, 92, 89, 90, 91.
Escrow is NOT the fee. They are equal on all 120 live rows only because
factoring_advances.reserve_amount_cents = factor_fee_cents — the source row carries the same
number twice. Populate faro_invoice_number and faro_purchase_date.

### 5. CHART — CC-3
4 new accounts (SQL written: ~/Downloads/09-23-2026-CC-3-CREATE-FOUR-ACCOUNTS-RUN-THIS.md),
retire 5010 DEF, reverse 5160/5170, E13-B D1-D5, ACCOUNT_KEY becomes ITEM_KEY.

### 6. ITEM CATALOG LOAD — CC-3
~/Downloads/item_catalog_seed.csv — 137 items, 20 categories, ZERO unmapped. Every row carries
its account, posts_to, a readable deterministic item_code, and for the six new driver deductions
the 49xx short-pay reason it mirrors. You LOAD it. You do not map it.

### 7. ESCROW WRITER — CC-3
Sign follows transaction_type (#22312 merged). Remaining: all 80 escrow lines feed; 20 never did.

## WHAT THE LEAD FINISHED THIS ROUND
- parse_settlements.py corrected for TWO defects that were silently destroying source data:
  a facility+city+state+zip that WRAPS to a second line, and Mexican state abbreviations
  ("Tam.", "N.L.") that a US-only pattern rejected. STOPS 355, WITH FACILITY NAME 355 (was 353).
  IF YOUR PARSER READS ALWAYSTRACK DOCUMENTS IT HAS BOTH BUGS UNLESS YOU FIXED THEM.
- run_feed_day.py, the feeder orchestrator: ONE day, then stop. 29 OF 29 DAYS PLAN CLEANLY.
  Enforces the architecture law, the within-day order, the three posting destinations,
  qty x rate on every line, and idempotency by natural key.
- build_item_catalog.py: 137 items, 20 categories, zero gaps.
- THE $6,720.00 LINE-HAUL VARIANCE IS CLOSED, and it was my control that was wrong, not the feed.
  "Company_Settlement_5760 (Merged) page 1.txt" and "Company_Settlement_5760.txt" are the SAME
  document. The control accumulates per load across documents, so 5760's loads counted twice.
  Corrected: line haul 436,415.00 -> 429,695.00, fuel 207,603.27 -> 204,835.47 over 501 rows
  (was 507), DEF 6,729.82 -> 6,623.74. All three now match feed_input.json to the cent.
  HAD WE FED AGAINST THE OLD CONTROL, EVERY GATE WOULD HAVE FAILED BY $9,487.80 AND THE HUNT
  WOULD HAVE BEEN IN THE FEEDER, WHERE THE DEFECT WAS NOT.

## THE RULE FOR THIS ROUND
No seat touches a transaction row. No seat starts anything outside its one or two items above.
A live-data guard ceiling that blocks a push is raised, cited to Round 86, and not investigated.
