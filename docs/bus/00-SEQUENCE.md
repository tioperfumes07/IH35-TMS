# 00-SEQUENCE — THE ORDER OF THE BUILD — OWNER-SET
2026-09-23 7:25 PM CT (00:25 UTC). Read with 00-WORK-QUEUE.md.

## THE SEQUENCE, IN THE OWNER'S WORDS
"ENGINES ARE BEING FULLY BUILT FIRST, THEN WE GO TO LOADBOARDS, LOAD COSTS,
PRE-SETTLEMENTS, SETTLEMENTS — MAKING SURE THEY ARE CORRECTLY WIRED AND
RENDERING THE SAME DATA THROUGHOUT, INCLUDING EXPENSES AND BILLS RELATED TO
THOSE LOADS."

## WHY THIS ORDER AND NOT THE REVERSE
A read surface can only be judged against a book that is actually there.
Production holds 7 loads of ~94. A loadboard rendering 7 correct rows tells
us nothing about whether it will render 94 correctly, and a Load Costs board
"looking right" at 7 loads is the exact false-green that cost this project
a month. **The engines must be correct AND the book substantially fed before
any read surface can be verified.**
Read-path CODE can be written now. Read-path PROOF waits for the data.

---

# PHASE 1 — ENGINES. WRITE PATH CORRECT. RUNS NOW, IN PARALLEL WITH THE FEED.
The engine is correct when the SAME chain runs whether a dispatcher books a
load in the app or the feed replays a signed document. One path, no second
implementation.

  1A  Cost path — an expense is an EXPENSE through the canonical writer with
      a real payment account. Never a hand-written JE. (Q01, Q05, Q26)
  1B  Feed path — idempotent and resumable, so any day can be re-run with no
      double-post. (Q04)
  1C  Void path — one dispatcher over the five engines, every void route
      reverses, no voided document keeps live postings. (Q07, Q08, Q24, Q25)
  1D  Settlement path — settlement posts GL, stamps its loads, reverses its
      deductions. (Q17, Q24)
  1E  Guards that hold 1A-1D shut. (Q02, Q03, Q09, Q10, Q11)

EXIT CRITERIA FOR PHASE 1 — all five, measured live, or Phase 3 does not start:
  - every cost JE has an accounting.expenses row behind it
  - zero cost postings credit 1090 / 1100 / 1150
  - a fed day re-run writes zero rows
  - every /void and /cancel route reaches a reversal engine
  - trial balance nets to 0.00 and banking.bank_transactions = 1133

# PHASE 2 — THE FEED COMPLETES. CURSOR ALONE.
23 Faro purchase days, 89 invoices, ending exactly at:
  purchases $311,587.00 · net advance $302,019.36 · receipts $12,825.00 ·
  AR $298,762.00 · banking 1133 EVERY DAY
Plus the 5 self-carried invoices ($12,592.40, not_factored, $0.00 paid;
13593 Alligator not invoiceable). Plus the still-active AlwaysTrack loads.
Settlements post as each tour's full load set lands and net_pay ties to the
signed TOTAL DUE to the cent.
NOBODY ELSE WRITES USMCA DATA DURING PHASE 2.

# PHASE 3 — READ PATH. ONE DEFINITION, EVERY SURFACE.
Code may be written during Phase 1. It is not VERIFIED until Phase 2 closes.

  3A  ONE canonical active-load set. Ten private copies deleted. Predicate:
      status NOT IN ('draft','invoiced','paid','closed','cancelled') AND NOT
      (the load carries an invoice with status NOT IN
      ('draft','proforma','void')). (Q18)
  3B  Dispatch renders ONLY live current work. No historical. Reports are
      where history lives. And the reverse defect too: 'delivered' and
      'delivered_pending_docs' are PRE-SETTLEMENT and must APPEAR on the
      dispatch boards — today no status list includes them. (Q18, Q19)
  3C  Load Costs shows open/pre-settlement loads only, never settled ones.
      (Q13)
  3D  Settlement / Presettlement column on EVERY accounting, financial and
      dispatch surface — list, table, drawer, modal, report. Settlement via
      driver_settlements + settlement_lines.load_id, NEVER the dead
      driver_bills.settled_in_settlement_id. Presettlement via
      mdata.loads.presettlement_link_id. (Q22)
  3E  Void / Cancel / Delete split button, same options on the multi-selector,
      system-wide. (Q20)
  3F  Filter bars, search and gear controls consistent system-wide. (Q21)

# PHASE 4 — CROSS-SURFACE TIE-OUT. THE REAL TEST.
Pick one load. Open it on EVERY surface. Every surface must show the SAME
numbers, from the SAME source, with no exception:
  the load itself · its stops · its invoice and factoring advance · its
  driver bill · its expenses · its fuel · its settlement or presettlement ·
  its P&L contribution on Load Costs · its row on every board it belongs on
GUARD: verify-load-renders-identically-everywhere.mjs — pick any live load,
query every surface's own API, assert the figures are identical to the cent.
A surface that disagrees is a defect in that surface, never in the load.
Repeat for a settled load, an open load, a voided load, and a load with a
reimbursement and a deduction.

PHASE 4 IS WHEN THIS IS DONE. Not when a board looks right — when every
board agrees, on every load, against the signed document.

---

## WHAT THIS MEANS FOR YOUR CLAIM RIGHT NOW
Claim PHASE 1 items first — Q01 to Q11, Q17, Q24, Q25, Q26.
Phase 3 code (Q18-Q23) may be claimed and BUILT now, but its DONE line needs
Phase 2 data. Build it, guard it, and hold the proof until the book is fed.
Phase 4 cannot start until Phase 2 closes. Nobody claims it yet.
If every Phase 1 item is claimed, take Q35 — the live Chrome walk — and file
findings for Phase 3. That item never empties.
