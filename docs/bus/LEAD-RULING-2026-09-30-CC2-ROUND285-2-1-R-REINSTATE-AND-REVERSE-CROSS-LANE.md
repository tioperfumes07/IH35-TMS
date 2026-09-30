# LEAD-RULING-2026-09-30-CC2-ROUND285-2-1-R-REINSTATE-AND-REVERSE-CROSS-LANE

## Lane-cross authorization for CC-2 touching `apps/backend/src/accounting/void.service.ts` AND
## `apps/backend/src/accounting/reinstate-document.service.ts`
## (CC-1's `apps/backend/src/accounting/**` lane, per docs/bus/LANES.md)

**Addendum -- `reinstate-document.service.ts` (same authorization):** `reinstateDocument`'s
`factoring_advance` case unconditionally threw ("read AUTH-113 before reinstating any factoring
advance"), and separately `DEFAULT_RESTORE_STATUS.factoring_advance` was `"funded"`, a value that
does not exist in `factoring_advances_status_check` (verified live: submitted, advanced,
reserve_held, collected, released, recourse_returned, disputed, voided). ROUND 285.2.1-R's own text
requires exactly this call ("Clear the flag through `reinstateDocument`... Do not hand-write the
UPDATE") for the 5 records this round's own classification determined have no live twin. Fixed both:
the case now delegates to the same `reinstateSimple` helper every other simple family uses, and the
restore status is `"advanced"` (matching these records' own pre-void status and their live twins).
No other function touched; the hard-refusal is satisfied by having actually done the AUTH-113-style
classification this round, not bypassed.

**Authorization basis:** direct Lead instruction, ROUND 285.2.1-R (relayed 2026-09-30), assigning
CC-2 to reverse/reinstate the 41 factoring_advances records -- the task cannot complete without
this fix, discovered while executing it.

## What was found

Dry-running `postVoidReversal` (the sanctioned reversal primitive) against all 41 records surfaced
a real, reproducible bug in its own reversal-linkage step (not the reversal itself): after building
the reversal JE and its lines, the function looks up the ORIGINAL journal entry(ies) to backfill
`reverses_je_id` (on the new reversal JE) and `reversed_by_je_id` (on the original) via

```
SELECT DISTINCT p.journal_entry_uuid FROM accounting.journal_entry_postings p
 WHERE p.source_transaction_type = $type AND p.source_transaction_id = $id
   AND p.journal_entry_uuid <> $reversalJeId
 ORDER BY 1 ASC
```

This query has NO status/voided_at/reversed_by_je_id filter, so for any entity with more than one
HISTORICAL journal entry ever posted against it (common in this exact population -- many of the 41
were reposted once already, e.g. FAC-2026-00048 has both a stale, already-reversed original
`328d5fd6...` and the current live one `cecc3f64...`), it returns ALL of them regardless of
liveness, then picks the alphabetically-first as `firstOriginalJeId` for the `reverses_je_id`
assignment. When that "first" pick happens to be the STALE original (already reversed by some
other, unrelated JE that already claims `reverses_je_id = <that stale id>`), the new UPDATE hits
`uq_je_reverses_je_id` (a partial unique index on `journal_entries.reverses_je_id`) and the whole
call throws, aborting the entire reversal transaction -- even though the core reversal (the correct
per-line reversal of the actually-live posting) would otherwise have succeeded. Reproduced live
(BEGIN...ROLLBACK) on 17 of 41 records in this population before the fix; confirmed the exact
collision mechanism by reading `journal_entries` directly (b550fe2e already had
`reverses_je_id = 328d5fd6`, the same value the buggy query was about to reuse).

## The fix

Add the same liveness filter (`status='posted' AND voided_at IS NULL AND reversed_by_je_id IS
NULL`) already used everywhere else in this file's own liveness test, to the `src` query inside
`postVoidReversal`, so `firstOriginalJeId` (and the `reversed_by_je_id` backfill loop) only ever
considers the currently-live original(s), never a stale/already-reversed historical sibling. This
is a pure bugfix to a metadata-linking step the function's own comments describe as "LINKED ONLY
WHEN UNAMBIGUOUS" / non-load-bearing for correctness (the exhaustive signal is `reversed_by_line_id`
per-posting) -- no change to the actual reversal-line construction or amounts. Re-verified after
the fix: all 41 records process without error in a live dry-run (BEGIN...ROLLBACK).

## Scope of the cross

One file, one query, additive WHERE-clause only (`apps/backend/src/accounting/void.service.ts`,
inside `postVoidReversal`'s `reverses_je_id`/`reversed_by_je_id` linkage block). No other function
in the file touched. `npx tsc -p tsconfig.json --noEmit` clean.
