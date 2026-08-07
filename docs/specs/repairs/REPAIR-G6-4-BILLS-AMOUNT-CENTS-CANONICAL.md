# REPAIR G6-4 — `accounting.bills.amount_cents` single canonical money representation

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** BUILD-AND-SHIP (financial / §1.4). Owner (Jorge) must approve the money backfill and
the VALIDATE / SET NOT NULL steps below. An agent NEVER runs a money-mutating UPDATE solo.

**Migration shipped (safe, no data mutation):**
`db/migrations/202607051200_g6_4_bills_amount_cents_canonical.sql`

---

## 1. The finding (dual representation + nullable canonical)

`accounting.bills` stores each bill's gross amount in **two** columns (added together in
`db/migrations/0090_p5_d2_bill_payment_balance.sql`):

| column         | type            | role                                                        |
|----------------|-----------------|-------------------------------------------------------------|
| `amount_cents` | `bigint`        | integer cents — **canonical** in the app write-path         |
| `total_amount` | `numeric(12,2)` | dollars — a **lossy derived mirror** (`amount_cents / 100`)  |

Drift / ambiguity risks:

1. **`amount_cents` is NULLABLE.** The only existing guard is `CHECK (amount_cents > 0)`. In
   Postgres a CHECK that evaluates to `NULL` is **not** a violation, so a row with
   `amount_cents = NULL` **passes** that check. A bill can persist with no canonical amount and only
   the dollars mirror populated.
2. **Two columns, one fact.** The app (`apps/backend/src/accounting/bills.service.ts`, `createBill`)
   writes both: `amount_cents = input.amountCents` and `total_amount = input.amountCents / 100`.
   Reads throughout the accounting layer defensively use
   `COALESCE(amount_cents, ROUND(total_amount * 100))` — proof that some rows are expected to carry
   **only** the mirror. `total_amount` is a `numeric(12,2)` rounded copy: it cannot represent
   sub-cent values and is redundant with the integer-cents source of truth.

Canonical decision: **`amount_cents` is the single source of truth.** `total_amount` is deprecated
to a derived mirror (kept for backward compatibility per the additive-only rule; never dropped
silently).

## 2. What the shipped migration does (safe, no data touched)

- `COMMENT`s on both columns declaring `amount_cents` canonical and `total_amount` a deprecated
  derived mirror.
- Adds `CHECK (amount_cents IS NOT NULL)` as **`NOT VALID`** (constraint name
  `bills_amount_cents_present`). `NOT VALID` enforces the rule for **every future INSERT/UPDATE**
  immediately, but does **not** scan or fail pre-existing rows — so it deploys cleanly on prod even
  if NULL rows exist today.

It does **not** run `SET NOT NULL` (would full-scan and fail on any existing NULL row) and does
**not** run any `UPDATE` (money-touching → owner-gated).

## 3. Owner-gated completion steps (Jorge approves each; run against prod after the migration deploys)

> ⚠️ **A data backfill IS required to fully finish this fix** because prod may hold bills with
> `amount_cents IS NULL`. These steps mutate money data and MUST be owner-run/approved — do not
> execute autonomously.

**Step A — assess (read-only, run first, paste counts to Jorge):**

```sql
-- How many bills are missing the canonical value, and can they be derived?
SELECT
  count(*)                                                          AS total_bills,
  count(*) FILTER (WHERE amount_cents IS NULL)                      AS null_canonical,
  count(*) FILTER (WHERE amount_cents IS NULL AND total_amount IS NOT NULL) AS derivable_from_mirror,
  count(*) FILTER (WHERE amount_cents IS NULL AND total_amount IS NULL)     AS both_null_needs_review
FROM accounting.bills;
```

**Step B — backfill the derivable rows (owner-approved money step):**

```sql
-- Set the canonical integer-cents value from the dollars mirror where it is missing.
UPDATE accounting.bills
SET    amount_cents = ROUND(total_amount * 100)::bigint,
       updated_at   = now()
WHERE  amount_cents IS NULL
  AND  total_amount IS NOT NULL;
```

**Step C — resolve `both_null` rows manually.** Any bill with BOTH `amount_cents` and `total_amount`
NULL cannot be derived. These need per-row owner review (correct the amount, or void via
`revoked_at` per void-not-delete). Do NOT guess a value.

**Step D — validate & lock (only after Steps B/C leave zero NULLs):**

```sql
-- Promote the guard to fully validated (scans existing rows; now passes because no NULLs remain).
ALTER TABLE accounting.bills VALIDATE CONSTRAINT bills_amount_cents_present;

-- Optional hard lock once validated: make the column truly NOT NULL.
ALTER TABLE accounting.bills ALTER COLUMN amount_cents SET NOT NULL;
```

**Step E — (future, additive-only) deprecate the mirror.** Do NOT `DROP` `total_amount`. Once all
readers are confirmed to use `amount_cents` only, `total_amount` can be turned into a generated
column or left frozen. Any change here is a separate owner-gated migration.

## 4. Parallel follow-up — `accounting.bill_payments`

`accounting.bill_payments` has the **identical** dual pattern: `amount_cents bigint` (nullable) +
`amount numeric(12,2)`, with the same `CHECK (amount_cents > 0)` that passes NULL and the same
`COALESCE(amount_cents, ROUND(amount * 100))` reads. Recommend an identical scoped fix
(`bill_payments_amount_cents_present` NOT VALID + backfill from `amount`). Left out of this PR to
keep the G6-4 change tightly scoped to the reported finding; flag for Jorge to green-light.

## 5. Suggested static CI guard (regression prevention, §2)

The DB `CHECK` is the runtime guard. Recommended static guard (non-financial tooling, mergeable on
green): a check asserting the `bills_amount_cents_present` constraint migration is present and that
no migration drops it, and/or that `INSERT INTO accounting.bills` sites always list `amount_cents`.
Not wired in this hold PR to avoid CI scope creep — noted for a follow-up.
