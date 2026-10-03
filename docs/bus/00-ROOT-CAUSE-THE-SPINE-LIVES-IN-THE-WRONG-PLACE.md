# ROOT CAUSE — THE SPINE IS WRITTEN BY CALLERS INSTEAD OF BY THE POSTER. ONE FIX, ~47 CALLERS. → CC-2

Measured, not guessed. This is the ROUND 337 hole and it is one function.

## THE MEASUREMENT (live prod, USMCA, voided excluded)

    source_type         postings   no spine link   unlinked
    expense                5,416           3,860      71.3%   $361,158.92
    invoice                  411              48      11.7%   $178,938.00
    all 10 other types     2,082               0       0.0%

Grouped by journal entry: **1,926 entries wholly unlinked, 770 wholly linked, ZERO partial.**
Not a leg bug. Not a loop bug. Two different code paths.

## THE CAUSE

`apps/backend/src/accounting/posting-engine.service.ts` is the central GL poster. It inserts
`accounting.journal_entries` (lines ~774, ~794) and `accounting.journal_entry_postings` (line ~831,
returning `postingIds`). **It has zero `writeTransactionSourceLink` calls and does not even import
`accounting-spine-emit.js`.**

`postSourceTransaction` / `postSourceTransactionInClientTx` (lines ~2644, ~2652) are called from
**~47 files**. The spine link gets written only when the *caller* remembers to write it:

    settlement-posting.service.ts   imports the spine  ->  driver_settlement  0.0% unlinked
    journal-entries.service.ts      imports the spine  ->  journal_entry      0.0% unlinked
    expenses.routes.ts              imports emitAccountingSpineEvent ONLY,
                                    NOT writeTransactionSourceLink    ->  expense  71.3% unlinked
    invoice-gl.service.ts           no spine import                   ->  invoice  11.7% unlinked

`expenses.routes.ts:9` imports `emitAccountingSpineEvent` from `./accounting-spine-emit.js` — the spine
*event* — while `writeTransactionSourceLink` is exported from **that same module at line 119** and is
never imported. The event fires; the `transaction_source_links` row is never written. That is the whole
defect, and it is why entries are wholly missing rather than partially.

## THE FIX — ONE PLACE

Write the link **inside the poster**, in the same transaction and the same loop that returns
`postingIds` (~line 831), from the `sourceType` / `sourceId` / `sourceLineId` the poster already has in
hand. Then every one of the ~47 callers is correct by construction and no caller can forget.

- Do **not** patch `expenses.routes.ts` and `invoice-gl.service.ts` separately. That is the third and
  fourth copy of a fix that belongs in one function — §9.0.17.
- Do **not** backfill the 3,908 rows. They are purge population. **Fix writers, not rows.**
- Remove the now-dead per-caller `writeTransactionSourceLink` calls, or leave them idempotent — state
  which in the PR and prove no double row.
- Guard `verify-every-posting-has-a-spine-link`: zero postings with no link, grouped by source type.
  Ceiling **0** once the poster writes it — not 2. The ROUND 342 Order 3 ceiling of 2 was sized for
  patching two callers; fixing the poster makes 0 correct. **That supersedes ROUND 342 Order 3.**
  Baseline **committed** — a gitignored self-written baseline is not a ratchet.

PROOF: one expense and one invoice posted on a fork, every leg carrying a `transaction_source_links`
row, written in the same transaction · the guard at 0 · trial balance still
**2,178,029.25 / 2,178,029.25 / .00 / 7,909 postings**.

This is the "full linkage and wiring and connectivity" item. Everything posts through this function, so
fixing it here links every transaction type at once — expense, bill, bill payment, invoice, payment,
settlement, fuel, maintenance, parts, lease, insurance, bank feed, cash advance.
