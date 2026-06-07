# Double-Entry Accounting Enforcement

> **TIER 1 TRUST — Block 5 of 13**
> Status: ✅ Active — constraint trigger live since migration `0092_p5_d4_manual_journal_entries.sql`

## The Invariant

Every journal entry in IH35-TMS **must have equal total debits and total credits**. No unbalanced
entry can survive a transaction commit. This is enforced at the database level so that
application-layer bugs cannot accidentally create an unbalanced ledger.

```
SUM(amount_cents WHERE debit_or_credit = 'debit')
  = SUM(amount_cents WHERE debit_or_credit = 'credit')
```

This is checked by a PostgreSQL **CONSTRAINT TRIGGER** — it fires at COMMIT (deferred), not at
each individual INSERT, so you can build a multi-line entry inside one transaction and the balance
only needs to hold by the time you commit.

## Canonical Tables

| Purpose | Table |
|---|---|
| Journal entry header | `accounting.journal_entries` |
| Journal entry lines (postings) | `accounting.journal_entry_postings` |

> **Do NOT use `journal_entry_lines`.** That name is explicitly forbidden by the
> `verify:accounting-backbone-schema` CI guard. The canonical name is `journal_entry_postings`.

### `accounting.journal_entry_postings` (key columns)

| Column | Type | Notes |
|---|---|---|
| `journal_entry_uuid` | `uuid` | FK to `accounting.journal_entries.id` |
| `debit_or_credit` | `text` | `'debit'` or `'credit'` |
| `amount_cents` | `bigint` | Always positive (`> 0` enforced by CHECK) |
| `account_id` | `uuid` | FK to `catalogs.accounts.id` |

## The Trigger

```sql
-- Function defined in: db/migrations/0092_p5_d4_manual_journal_entries.sql
CREATE OR REPLACE FUNCTION accounting.ensure_journal_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id uuid;
  debit_total bigint;
  credit_total bigint;
BEGIN
  target_id := COALESCE(NEW.journal_entry_uuid, OLD.journal_entry_uuid);
  IF target_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN debit_or_credit = 'debit'  THEN amount_cents ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE 0 END), 0)::bigint
  INTO debit_total, credit_total
  FROM accounting.journal_entry_postings
  WHERE journal_entry_uuid = target_id;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debits=% credits=%)',
      target_id, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

-- Trigger defined in the same migration
CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION accounting.ensure_journal_entry_balanced();
```

### Why DEFERRABLE INITIALLY DEFERRED?

The constraint is deferred to **COMMIT time**, not per-row. This allows you to:
1. INSERT the debit line
2. INSERT the credit line
3. COMMIT → trigger fires, sees balanced total → succeeds

If the trigger were `INITIALLY IMMEDIATE`, inserting the first line of a two-line entry would fail
because the single line is temporarily unbalanced. Deferred firing is the correct design for
multi-line journal entries.

### Error on Imbalance

When a transaction commits with an unbalanced entry the trigger raises:

```
ERROR: journal entry <uuid> is not balanced (debits=<N> credits=<M>)
SQLSTATE: 23514 (check_violation)
```

Application code that catches DB errors should map SQLSTATE `23514` on this table to an HTTP 409
(Conflict) and surface a user-friendly message: "Journal entry lines must balance (debits must
equal credits)."

## Application Layer

All financial writes route through `lib/services/journal.mjs` → `postJournalEntry({ lines })`.
This service validates balance before sending to the DB (app-layer defense). The DB trigger is the
**safety net** — it catches any path that bypasses the service layer.

## CI Guards

| Guard | Purpose |
|---|---|
| `verify:double-entry-balance` (`scripts/verify-double-entry-balance-trigger.mjs`) | Static — asserts trigger + function exist in migrations; fails if any migration drops them without re-creating |
| `verify:accounting-backbone-schema` (`scripts/verify-accounting-backbone-schema.mjs`) | Static — forbids `accounting.journal_entry_lines` table (wrong name) |
| `test:coverage` | DB integration test `double-entry-trigger.db.test.ts` — proves the trigger actually rejects unbalanced entries in real Postgres |

## Verifying on a Live Database

Run the existing-data balance check to confirm no legacy entries are unbalanced:

```sql
SELECT
  je.id,
  SUM(CASE WHEN p.debit_or_credit = 'debit'  THEN p.amount_cents ELSE 0 END) AS debits_cents,
  SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END) AS credits_cents
FROM accounting.journal_entries je
JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
GROUP BY je.id
HAVING
  SUM(CASE WHEN p.debit_or_credit = 'debit'  THEN p.amount_cents ELSE 0 END) <>
  SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END);
```

Expected result: **0 rows**. If any rows are returned, stop and escalate — this is a data quality
emergency (TIER 1 HARD STOP per Block 5 spec).

## Migration History

| Migration | What it added |
|---|---|
| `0092_p5_d4_manual_journal_entries.sql` | Created `accounting.journal_entries`, `accounting.journal_entry_postings`, function `accounting.ensure_journal_entry_balanced()`, and `trg_check_journal_entry_balanced` CONSTRAINT TRIGGER |
| Block 5 / `feat/tier1-double-entry-guard` | Added CI guard (`verify:double-entry-balance`) + DB integration test + this doc. No schema changes. |

## Out of Scope (Future Blocks)

- Multi-currency (currently USD only)
- Reversing entries automation (Block TBD)
- Period-lock enforcement (Block 6)
