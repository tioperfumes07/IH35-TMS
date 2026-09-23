# LEAD RULING — 2026-09-23 — CURSOR TAKES THE ITEM + LINE SCHEMA
# Committed by Cursor on the Lead's behalf, verbatim as relayed by the owner.
# Cite as LANE-CROSS: this file.

```
CURSOR — LANE CROSS GRANTED. YOU TAKE THE ITEM + LINE SCHEMA. IT IS ONE OF THE SEVEN.

catalogs.item_categories and the item/quantity/rate/amount columns on accounting.bill_lines,
accounting.invoice_lines, the driver_finance settlement lines and the load-cost line are CC-1
lane per LANES.md. CROSSED TO YOU for this work only, same terms as the E1 cross. Reason: CC-1
holds the stop writer and E6 and cannot also carry a schema migration without becoming the
bottleneck. Post the migration claim first. CC-1 does not touch these files while it is open.

BUILD: item_id, quantity NUMERIC (3dp for gallons, 1dp for miles), rate_cents, amount_cents
COMPUTED, unit_of_measure, and a CHECK that refuses a row where qty x rate != amount.

TWO THINGS MY ORCHESTRATOR PROVED — BUILD TO THEM, THEY ARE NOT OPINIONS:
 1. An invoice is ONE document with MANY lines. So is a driver bill. Lines attach to a
    document; never create a document per line. (I had this wrong first and it also made the
    feed non-idempotent — duplicate natural keys.)
 2. A driver bill is the document every driver-side movement attaches to. LOAD 13588 carries an
    escrow deduction and NO pay lines — the bill must still exist to hold it. Pay lines are NOT
    a precondition for creating a driver bill.

Order: finish E7 batch 2, then this. I-DEDUCT waits until after the purge.
```
