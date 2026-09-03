# Bank categorization — "who" audit column — schema spec (owner FINISH LAW 2026-09-03, CC-3 assignment)

**Author:** CC-3 (mechanical/entity-schema — migration is CC-1's lane, `db/migrations/*.sql` is
fail-closed banned for CC-3 by `verify-migration-lane-band.mjs`). This is a spec handoff, not a
migration.

## Assignment context

Owner FINISH LAW (2026-09-03) assigned CC-3: "Bank categorization queue. 0 of 395 categorized.
Suggest-never-post, bulk by merchant, remember a merchant decision, record who and when."

Shipped this pass (PR `cc3/bank-merchant-rule-remember`, FINDING `BANK-F9970`):
- **Remember a merchant decision** — wired the pre-existing (but never API-reachable)
  `banking.transaction_categories.description_pattern` column through the rules CRUD routes +
  `CategorizationRulesPage.tsx`, with the "Create rule" action on a transaction now carrying the
  merchant text as a prefill. No migration needed — the column already existed.
- **Bulk by merchant** — verified live, already fully functional via the existing "Filter by
  description" search + ParityTable select-all + bulk "Categorize" action on
  `/banking/transactions`. No new code needed.
- **Suggest-never-post** — verified architecturally already correct: every categorize write path
  (`categorization.routes.ts`'s single-tx and `categorize-bulk` routes) requires an explicit
  authenticated user action naming the account; `autoCategorize`'s only live-write caller is the
  owner-gated `apply-historical` endpoint, which defaults `dry_run=true`.
- **"When"** — already correctly written. Live-verified all 3 app-level categorize write paths
  (`categorization.routes.ts` single-tx, `categorization.routes.ts` `categorize-bulk`,
  `plaid.service.ts` `autoCategorize`) set `status='categorized'` AND `categorized_at=now()`
  together, every time.

## What's blocked — "who"

`banking.bank_transactions` has **no column at all** for which user categorized a transaction.
Live-verified on prod (Neon `tiny-field-89581227`, `bypass_rls`, USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80`): `information_schema.columns` for
`banking.bank_transactions` has `categorized_at` but no `categorized_by_user_id` (or equivalent)
anywhere in its ~90 columns.

All three write paths already have the actor's identity in scope at the moment they write
`categorized_at`:
- `categorization.routes.ts`'s single-tx categorize route: `currentAuthUser(req, reply)` → `user.uuid`
- `categorization.routes.ts`'s `categorize-bulk` route: same `currentAuthUser` pattern
- `plaid.service.ts`'s `autoCategorize`: already accepts `opts.actorUserUuid` (used today only for
  the CRUD-audit log entry, never persisted to the row itself)

This is purely a missing column — the actor id is already available at every call site, it just
has nowhere to go.

## Proposed schema (additive, CREATE/ALTER-only, idempotent)

```sql
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorized_by_user_id uuid NULL
    REFERENCES identity.users(id);

COMMENT ON COLUMN banking.bank_transactions.categorized_by_user_id IS
  'User who categorized this transaction (set alongside categorized_at). Nullable: rows
   categorized before this column existed, and rows categorized by the rule-matching engine
   with no human actor (autoCategorize dry_run=false calls from apply-historical), never have
   one — that is EXPECTED STATE, not a defect, same class as QBO-import rows never having a
   TMS-native actor.';
```

- **Type:** `uuid`, matching `identity.users.id`.
- **Nullability:** nullable — historical rows and rule-engine-only categorizations (no human in
  the loop at that moment) legitimately have no actor.
- **No backfill:** there is nothing to backfill from — the actor was never recorded anywhere else
  for existing rows. (8 live USMCA rows carry a real `coa_account_id` with `status='uncategorized'`
  and `categorized_at IS NULL` — none of the 3 current app write paths produce that shape, so
  those predate the current code; they get `categorized_by_user_id IS NULL` too, honestly.)

## Application-code changes (CC-3, after the migration lands — not this PR)

- `categorization.routes.ts`'s single-tx and `categorize-bulk` UPDATE statements: add
  `categorized_by_user_id = $N` alongside the existing `categorized_at = now()` in both.
- `plaid.service.ts`'s `autoCategorize`: when `opts.actorUserUuid` is present (i.e.
  `dry_run=false`), set `categorized_by_user_id = $N` in its own UPDATE too — when absent (a
  hypothetical future fully-automatic path), leave it NULL and that is honest, not a bug.
- Surface it: `BankingTransactionsDesignView.tsx` / `BankTxCategorizationPage.tsx` (archived) /
  `CategorizationRulesPage.tsx` preview panel could show "Categorized by X on Y" once the column
  exists — a follow-up, not required to close this row.

## Linkage declaration (§10 LINKAGE LAW)

- Canonical target: `banking.bank_transactions` (canonical, not a RETIRE table) FK to
  `identity.users` (hub table).
- Read path: any future "who categorized this" UI (not built yet).
- Write path: the 3 categorize routes/functions named above.
- Both-way: `banking.bank_transactions.categorized_by_user_id` ⇄ `identity.users.id`. No
  duplication — this is a pure actor-attribution FK, same pattern as every other
  `*_by_user_id` column in this schema (e.g. `voided_by_user_id`, `posted_by_user_id`).

## What CC-3 will NOT do here

- Not authoring the migration file (`db/migrations/*.sql`) — CC-1's lane.
- Not touching any existing categorize route's UPDATE statement in this PR — that follows once
  the column exists live.
- Not backfilling a guessed actor onto historical rows — there is no source to backfill from, and
  guessing would misattribute real categorization decisions to the wrong person.

**Handoff:** routed to CC-1 (migration lane, 00:00–11:59 UTC window) via `docs/bus/INBOX-CC-1.md`.
