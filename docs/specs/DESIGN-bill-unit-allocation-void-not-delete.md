# DESIGN — `accounting.bill_unit_allocation`: DELETE-then-INSERT → void-not-delete

**Status:** DESIGN ONLY — no code, no migration. Financial cluster (§1.4): the build (schema
migration + `accounting.*` writes + money reads) is owner-gated; builder never self-merges.
**Author:** builder lane, 2026-07-20. **Verified against:** `origin/main`.
**Subject:** `accounting.bill_unit_allocation` (table: `db/migrations/0264_bill_unit_allocation.sql`)
**Related:** §2 void-not-delete + append-only audit · `[[handoff-audit-and-fix-program-2026-07-20]]` §4.3

---

## 1. Finding — re-allocation DELETEs financial history, in TWO places (not one)

Re-allocating a bill across units hard-DELETEs the prior allocation and re-INSERTs the new one. On a
**financial** table (`allocated_amount_cents` per asset), that destroys the audit trail of how a bill's
cost was split over time — a CPA/auditor cannot reconstruct a prior allocation. This violates the §2
void-not-delete rule and the append-only expectation for money data.

Reported as one site. Verified on `origin/main` — **there are two DELETE sites**, and the reported one
was `bills.routes.ts:453`:

| # | DELETE site | Context |
|---|---|---|
| 1 | `apps/backend/src/accounting/bills.routes.ts:453` | manual re-allocation endpoint |
| 2 | `apps/backend/src/maint/wo-ap-posting.service.ts:359` | WO→AP posting re-allocation |

Both run `DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1 AND tenant_id = $2` then loop
INSERTs. A fix that touches only site 1 leaves site 2 destroying history exactly the same way.

### 1.1 Full surface (why this is a design memo, not a one-line edit)

The table has `UNIQUE (bill_id, asset_id)` and money reads that plain-`SUM` every row. Converting to
soft-delete touches all of it — verified inventory on `origin/main`:

| Kind | Location | Impact of the conversion |
|---|---|---|
| DELETE | `bills.routes.ts:453` | → soft-void |
| DELETE | `maint/wo-ap-posting.service.ts:359` | → soft-void |
| INSERT | `bills.routes.ts:461` | must coexist with a **voided** prior row for the same `(bill_id, asset_id)` |
| INSERT | `maint/wo-ap-posting.service.ts:365` | same |
| INSERT | `insurance/policy-create-atomic.service.ts:190` | same |
| INSERT | `insurance/dispersal.routes.ts:236` | same |
| READ (SUM) | `bills.routes.ts:518` (`/assets/:id/allocated-costs`) | **MUST** filter `voided_at IS NULL` |

---

## 2. The three problems the fix must solve TOGETHER

### 2.1 The `UNIQUE (bill_id, asset_id)` constraint is the load-bearing blocker

Soft-delete keeps the old row. Re-inserting a new allocation for the **same** `(bill_id, asset_id)`
then collides with `UNIQUE (bill_id, asset_id)` and the INSERT fails. So the plain unique must become a
**partial** unique that only constrains live rows:

```sql
-- drop the total unique, replace with a partial unique index over non-voided rows
ALTER TABLE accounting.bill_unit_allocation DROP CONSTRAINT bill_unit_allocation_bill_id_asset_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_unit_allocation_active
  ON accounting.bill_unit_allocation (bill_id, asset_id)
  WHERE voided_at IS NULL;
```

This matches the house pattern (e.g. `catalogs.payment_methods` partial unique
`WHERE is_active AND voided_at IS NULL`, migration `202607380000`). **Dropping a constraint is a schema
change on `accounting.*` → owner-gated, §1.4.** Note `bill_unit_allocation_bill_id_asset_id_key` is the
default constraint name Postgres assigns to `UNIQUE (bill_id, asset_id)`; confirm the exact name on prod
before writing the migration (§0 — verify against prod, do not assume).

### 2.2 Every read must exclude voided rows or the money doubles

`bills.routes.ts:518` sums `allocated_amount_cents` over all rows for the asset. After soft-delete, a
re-allocated bill has BOTH the voided old rows and the live new rows — the SUM would **double-count**
and report inflated allocated cost. Every read (this SUM today; any future reader) must add
`a.voided_at IS NULL`. This is the read half of §2.1 and is not optional: getting the schema right but
missing a read filter produces silently wrong financial totals, which is worse than the current gap.

### 2.3 The DELETEs become state-guarded soft-voids

Replace each `DELETE` with:

```sql
UPDATE accounting.bill_unit_allocation
   SET voided_at = now(), voided_by = $3, void_reason = 'reallocated'
 WHERE bill_id = $1 AND tenant_id = $2 AND voided_at IS NULL;
```

then INSERT the new rows as today. Wrap the void+insert in the existing transaction (both sites already
run inside a `withCompanyScope` / client transaction) so a re-allocation is atomic — never a window
with the old rows voided and the new ones not yet written.

---

## 3. Migration sketch (owner-gated — NOT built here)

Idempotent, additive, number strictly above main's max at push time (re-checked):

```sql
BEGIN;
ALTER TABLE accounting.bill_unit_allocation
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS voided_by   uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;  -- §2: every table gets is_active
-- swap total unique → partial unique over live rows (see §2.1; confirm the real constraint name on prod)
-- (DROP CONSTRAINT ... ; CREATE UNIQUE INDEX ... WHERE voided_at IS NULL;)
COMMIT;
```

Invariants carried: FORCED RLS + the tenant policy already exist (0264) and are unaffected; grants to
`ih35_app` already exist (0264) and additive columns inherit; no view, so `security_invoker` N/A. The
`bill_id` FK is `ON DELETE CASCADE` to `accounting.bills` — bills are themselves void-not-delete, so the
cascade should never fire in practice, but it should be reviewed (a hard bill delete would still wipe
allocations; out of scope here, flagged).

**Audit:** the void must append to `audit.row_changes` (append-only) so the prior allocation is
recoverable — that is the entire point of the change. Confirm whether the table already has an audit
trigger; if not, the void path writes the audit row explicitly.

---

## 4. Anti-regression guard (§2) — and it must cover BOTH sites

`scripts/verify-bill-unit-allocation-void-not-delete.mjs`, static, no DB:

1. **No** `DELETE FROM accounting.bill_unit_allocation` anywhere in `apps/**` production code (this is
   what catches a re-introduced hard delete at either site — or a new third one).
2. Every read (`FROM`/`JOIN accounting.bill_unit_allocation`) in production code filters
   `voided_at IS NULL`.
3. The migration adds the partial unique index `WHERE voided_at IS NULL` and does not leave a total
   `UNIQUE (bill_id, asset_id)` in force.
4. `--selftest` with a planted `DELETE` and a planted unfiltered read that both MUST make it red.

Wire into `verify-steps/` + `locked-guards.yml` + `package.json`.

---

## 5. Sequencing (owner-gated build, when approved)

One PR, because the three parts are interlocking and shipping any subset breaks the table:
1. migration (§3) — adds soft-delete columns + partial unique;
2. both DELETE sites → soft-void (§2.3);
3. the SUM read + any other reader → `voided_at IS NULL` (§2.2);
4. the guard (§4).

Splitting them is unsafe: schema-without-reads double-counts money; reads-without-schema reference a
missing column. It lands as one financial PR with the full SQL shown, per §1.4.

---

## 6. Open questions for the owner

1. **Void reason vocabulary** — `'reallocated'` for the re-allocation path; is a richer reason set
   wanted (manual vs WO-posting vs insurance-driven)?
2. **Retention** — voided allocation rows accumulate. Keep indefinitely (audit-forever, recommended per
   §7 additive-only) or archive after N years? Not `DELETE`, ever.
3. **Existing history is already lost.** Prior DELETEs left no trace; this fix is forward-only. No
   backfill is possible (the data is gone) — worth stating so no one expects reconstructed history.

---

## 7. What this document does NOT do

No code, no migration, no schema change, no prod access. A design proposal awaiting the owner's
approval; per §1.4 the builder will not self-merge, and per the standing rule the builder does not merge
at all.
