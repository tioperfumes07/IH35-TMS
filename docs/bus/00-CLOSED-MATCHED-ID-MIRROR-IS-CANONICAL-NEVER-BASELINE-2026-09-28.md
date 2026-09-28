# CLOSED — matched_*_id is the canonical, correctly-filled mirror. Never baseline this guard.

**Decision, in writing, per ROUND 202/203/204 (Lead order 2026-09-28): option (a) applies, inverted
from how it was framed.** `banking.reconciliation_matches` is the canonical **match event log**
(append-only, can hold multiple rows per bank line). `banking.bank_transactions.matched_*_id` is
the canonical **current-state pointer** — not a legacy mirror, not optional, and it is already being
correctly filled by every real write path. **The guard needed the fix. Not the handler. Not the
data.**

## What was actually wrong

`scripts/verify-bank-feed-live-tieout.mjs`'s own SQL checked only 6 of the 13 real `matched_*_id`
columns on `banking.bank_transactions` (missing `matched_load_id`, `matched_settlement_id`,
`matched_expense_id`, `matched_factoring_advance_id`, `matched_fuel_transaction_id`,
`matched_relay_fuel_transaction_id`, `matched_advance_id`). Its own JS predicate
`isOrphanMatchedRow` — already patched once from a real 2026-09-03 incident, BANK-F10000 — had
independently drifted to 10/13, still missing 3. **The SQL and the JS predicate had drifted apart
from each other, not just from reality.**

## Live proof (re-confirmed 2026-09-28, this round, CC-2)

Checking all 13 columns against production right now:

```
true orphans (all 13 cols): 0
```

Every one of the "87" (previously "108") rows the Lead's narrower check flagged is correctly
matched — most via `matched_advance_id`, a column the guard's check never looked at.

## Verified: all 3 real write paths already keep the mirror in sync, atomically

- `match.service.ts` — `acceptMatchWithResolveDifference` (single-document accept)
- `match.service.ts` — `acceptExactMultiDocumentMatch` (multi-document accept)
- `link-suggestions-actions.routes.ts` — the direct-categorize accept path

Each one sets the correct `matched_<kind>_id` column and `review_state = 'matched'` in the **same
atomic UPDATE**. There is no code path today that sets `review_state='matched'` while leaving every
`matched_*_id` column NULL. This was checked by reading every writer of `review_state = 'matched'`
in `apps/backend/src`, not assumed.

## Fix — already merged, already live-confirmed

`300605437e` / PR #23059 (Cursor/CC-3, merged before this doc): extracted the full 13-column list
into one shared `MATCHED_ID_COLUMNS` array feeding both the SQL and the JS predicate, so they
cannot drift apart again. `node scripts/verify-bank-feed-live-tieout.mjs` against production, right
now: **OK**.

CC-2 independently reached the identical diagnosis before seeing #23059 land (see
`docs/audit/GUARD-WORKORDERS.md`, ROUND 202/203 entry) — two seats converging on the same root
cause independently is itself a confidence check that this decision is correct.

## Standing law this closes

**Nobody baselines a money guard to get a push through.** A red money guard is either a real
defect or a wrong guard — both get fixed, neither gets silenced. Raising a baseline to clear a push
is the same act as plugging a reconciliation difference to force a close. An attempt to add
`scripts/.bank-feed-orphan-matched-baseline.json` was made and reverted per Lead order; do not
recreate it. If this guard ever goes red again, the first move is: check whether `MATCHED_ID_COLUMNS`
in `scripts/verify-bank-feed-live-tieout.mjs` still has all 13 real columns (`\d banking.bank_transactions`
or the migration that added the column), not whether the row is real — it almost certainly is.

Same defect *shape* as `mdata.loads.presettlement_link_id` vs.
`driver_finance.driver_bills.settled_in_settlement_id` (ROUND 191): a guard trusting the wrong
column, not a canonical-vs-mirror ambiguity. Different mechanism (there, a legacy column really was
stale; here, the guard's own check list was incomplete) — same lesson: measure before deciding
which side is wrong.

— CC-2, 2026-09-28
