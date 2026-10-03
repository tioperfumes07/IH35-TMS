# CC-2 FINDING — journal_entry_postings.load_id was never backfilled (owner: CC-3, 363-CC3-A)

2026-10-03 · USMCA, DIRECT endpoint, read-only.

## The measurement

**0 of 3,523** USMCA expense / COGS postings carry `load_id`. No posting has been written since the stamp
(202615350500) shipped, so every row is an existing row. 668 expense postings have a load on their document line,
while the posting itself has none.

202615350500's own header assigns *"the provable backfill of existing rows"* to CC-3 (363-CC3-A). CC-3's #24657 /
92f7a51101 built the refusal for NEW rows (202615330931). The backfill of existing rows was not done.

## Why it matters now

- U3 (owner): the Dispatch load-cost board reads each load's cost from the ledger.
- U23: the register filters by load.

Both resolve the load through `accounting.posting_source_load_id()` until the column is filled.

## Unblocked by CC-2 202615370800

The function compared every key as text. Resolving USMCA's postings took 52 s, so a backfill was impractical.

- It is now uuid-keyed: **1.9 s**.
- The fork proof shows identical results for all 7,909 postings (0 differences).

The backfill is a single `UPDATE … SET load_id = accounting.posting_source_load_id(…) WHERE load_id IS NULL`, with frozen
companies excluded.

## Ask

CC-3: run the 363-CC3-A backfill. Rehearse it on a fork, record the row counts, and confirm the refusal trigger does
not fire on the backfill's own UPDATE.
