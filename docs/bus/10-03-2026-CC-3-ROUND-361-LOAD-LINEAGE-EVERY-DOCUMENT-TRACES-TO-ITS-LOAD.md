# CC-3 — ROUND 361 — LOAD LINEAGE. EVERY DOCUMENT, POSTING AND REVERSAL TRACES BACK TO ITS LOAD.

Owner, 2026-10-03: *"LETS MAKE SURE ALL THESE REVERSALS ETC, DOCUMENTS ETC ARE LINKED ALL THE WAY BACK TO
THE CREATORS IN THE LOADS, BECAUSE IN ESSENCE MOST OF THESE EVENTS WILL BE CREATED WHEN A LOAD IS CREATED."*

He is right: the load is the **originating event** for most of the money in this system. Revenue, the
driver bill, fuel, tolls, accessorials, the settlement, the invoice, the factoring advance — nearly all of
it is born from a load. **Today a reversal can be an orphan with no way back to what caused it.**

## THE REQUIREMENT — TWO DIRECTIONS, NO BROKEN LINKS
    FORWARD   open a load  -> every document, posting, reversal, bank line and settlement it ever caused
    BACKWARD  open ANY of those -> walk back to the load that caused it, in one hop or a named chain

A chain that stops anywhere is a defect. **"It is derivable by joining four tables" is not a link.**

## WHAT MUST CARRY THE LOAD — AND REVERSALS ARE THE POINT
1. **Documents born from a load** carry `load_id` at creation, in the same transaction: expense, bill,
   driver bill, invoice, bill payment, customer payment, settlement line, fuel transaction, accessorial.
2. **A REVERSAL CARRIES BOTH** — the document it reverses **and** that document's `load_id`. A reversal
   that only points at its original forces a second hop to find the load, and if the original is ever
   purged the reversal is orphaned. **Copy the load forward onto the reversal.**
3. **Every posting already carries its spine link** (`transaction_source_links`, enforced by
   `trg_live_posting_keeps_spine_link`). The spine gives posting → document. This round gives
   document → load. **Together they complete the chain: posting → document → load.**
4. **Cancellation and void records** carry the load: `dispatch.load_cancellations` already does; the void
   stamp and its reversal entries must too.

## MEASURE FIRST, FIX SECOND — REPORT BEFORE YOU BUILD
For every money table, report: rows, how many carry a `load_id`, how many *should* (a load caused them),
and how many are **derivable but not stored** (the parent has a load, the child does not).
Known starting points: `accounting.bills.load_id` NULL on 25 of 93 live;
`accounting.expenses.load_id` NULL on 1 of 550; `accounting.invoices.source_load_id` NULL on 1 of 110.
**Post the table in the bus before writing a migration.** I want to see the shape before you change it.

## BUILD
- Populate `load_id` **at creation**, in the same transaction as the document. **Never a later job.**
- Where a load caused it and the column is NULL today, derive once in the migration from the parent
  (bill → its load via the settlement or the work order; reversal → its original's load) and **do not
  guess**. A row with no provable load stays NULL and is **reported**, not filled.
- A load-born document that is written with a NULL `load_id` is **refused** — trigger or CHECK, in the
  database, so an import or a direct call cannot route around it.
- Guard `verify-every-load-born-document-carries-its-load` and
  `verify-every-reversal-carries-its-originals-load`. Ceiling **0**, baselines **committed**, run
  **unscoped** (a company filter cannot see a row that escaped its company).

## FINISH TEST — ON A FORK, PASTED
Take one live load end to end: book it, invoice it, settle it, pay the driver, reverse one document.
Then from the **reversal alone**, walk back: reversal → original document → load → the dispatch record.
Then from the **load**, list every artifact it ever created, including the reversal.
**Both directions, no gaps, pasted.** If any hop needs a human to know which table to join, it is not done.

## DO NOT
- Do not backfill by guessing a load. A wrong linkage is worse than a NULL you reported.
- Do not repair purge-population rows by hand. **Fix writers, not rows.**
- Do not add a new "lineage" table. The load id goes on the document; the spine already does the rest.
  **No parallel index of what links to what** — that is the second-system mistake in a new costume.

DEADLINE: the measurement table in the bus by **2026-10-04 12:00Z**, build after I read it.
