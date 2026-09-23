# THE E10 REHEARSAL FAILED — AND THE 274 ORPHAN HEADERS ARE NOT CC-3'S RACE

**Lead, 2026-09-23. Full `--execute` run of `e10-void-runner-01-usmca.ts` on
`br-raspy-fog-akl1n2n2`, the pre-purge snapshot taken off production at LSN `E7/BDD7058`.
ONE instance, sequential, no concurrency. Production was never touched.**

## The run

| phase | result |
|---|---|
| settlements + driver bills | 14 already reversed, **0 errors** |
| factoring advances | **69 reversed, 0 errors** |
| invoices | **0 reversed, 77 errors** |
| expenses | 159 reversed, 119 already reversed, **202 errors** |
| revrec latches | 0 reversed, 2 already, **137 errors** |
| fuel | NO PATH — 1,170 legs / $501,511.22 (runner 02 now exists) |

**416 errors. The rehearsal failed. That is what the rehearsal was for.**

Had this run on production, the books would now be half-voided — 69 factoring advances and 159
expenses reversed, 77 invoices untouched, 137 entries refused — with nothing to roll back,
because the runner commits per document.

## Three causes, in the engine's own words

**1 — 202 expenses + 7 invoices:**
`duplicate key value violates unique constraint "uq_posting_batches_company_idempotency_key"`
The reversal engine mints a posting batch whose idempotency key collides with one that already
exists. The database is correctly refusing to let the engine reverse the same thing twice. **The
engine is not idempotent against its own prior run** — which is precisely what a purge that can
be re-run after a failure requires.

**2 — 70 invoices:** `No posted batch found to reverse`
The invoice has a live posted journal entry but **no posting batch**, so the batch-oriented
reversal path cannot find its handle. The entry exists; the wrapper it expects does not.

**3 — 137 revrec latches:** `journal entry <id> is not balanced (debits=0 credits=490000)`

## Cause 3 is the important one, and it exonerates CC-3

CC-3 reported 274 orphaned reversal-JE headers and **blamed his own concurrency mistake** —
he ran two instances of the mutating runner at once and took responsibility for the result. He
was right to report it and right not to file the resulting "137 balance-check failures" as a
finding.

**It was not the concurrency.** Measured:

    production (br-fancy-credit-akjnd07a)
      journal entries ................................ 3,172
      journal entries with ZERO posting lines .........     0     <- clean

    snapshot after ONE sequential E10 run
      journal entries ................................ 3,776
      journal entries with ZERO posting lines .........   274     <- exactly CC-3's number
      of those, marked as reversal entries ............     0

**274. The same number, from a single instance, sequentially.** This is a deterministic defect
in the revrec reversal path: it creates the reversing journal-entry header, the lines are never
written, and the header is left orphaned and unlinked. On the next attempt the header exists
with zero lines, so the balance check reads `debits=0 credits=<amount>` and refuses — correctly.

The refusal is the guard working. The orphan header is the bug.

## What this means for the purge

**The void does not run on production until all three are fixed.** Not because of a rule anyone
invented — because a single rehearsal on an exact copy produced 416 errors and 274 orphaned
headers, and doing that to the real books would be unrecoverable by design, since this database
refuses to delete what it creates.

Production is untouched and unchanged. Every number above is from the snapshot.

## Owed, in priority order

1. **The revrec orphan header.** The reversing header must be written in the same transaction as
   its lines, or not at all. 274 deterministic orphans is the whole of cause 3.
2. **Idempotent reversal batches.** A re-run must recognise its own prior batch instead of
   colliding with it. 209 of the 416 errors.
3. **The 70 invoices with a live posting and no batch.** Either the batch-oriented path needs a
   by-journal-entry fallback (engines #5/#6 already accept any posted entry id), or those
   postings were written outside the batch path and that is its own finding.
