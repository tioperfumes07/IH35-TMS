# DESIGN HOLD — Claim→WO→Bill/Expense FK linkage (Accounting audit item 12/22)

> **STATUS: SCHEMA DESIGN ONLY · HOLD-FOR-JORGE · NEON HOLD — DO NOT MERGE-AS-LIVE.**
> Migration is held (`DO NOT RUN ON PROD`), registered, additive-only. No code wiring, no GL/JE, no
> flag flip in this PR. Base: `origin/main` @ `cc9a82f47`.

**Source:** accounting audit ranked-PR queue, item **12/22** — "Claim→WO→Bill/Expense FKs — HOLD
financial + Neon" (`~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-RANKED-PRS-6-12.md`).
**Root evidence:** `apps/backend/src/insurance/claim.routes.ts`'s own claim-graph endpoint
(`GET /api/v1/insurance/claims/:id/graph`) documents this exact gap in its response payload:

```
gaps: {
  expense: "no accounting.expenses.claim_id (or equivalent) on prod",
  work_order: "no maintenance.work_orders.claim_id on prod",
  settlement_deduction: "no driver_finance.driver_settlement_deductions.source claim FK on prod",
}
```

Independently confirmed by `docs/trackers/LAW-E2E-CLAIM-LEGAL-EXPENSE-LINKAGE-2026-07-21.md` hop 3
(Neon `information_schema` introspection, RLS-bypass, 2026-07-21): `accounting.expenses` carries
`driver_uuid` / `unit_id` / `load_id` / `linked_work_order_uuid` / `payment_account_uuid` /
`journal_entry_id` — **no** `claim_id`. `accounting.bills` carries `source` / `source_system` / the WO
link — **no** claim FK. `maintenance.work_orders` (migration `0049`) carries `unit_id` / `vendor_id` —
**no** claim FK.

---

## 1. Current schema (Neon prod live-verified 2026-07-22)

**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · db `neondb`.
Column/FK existence via `information_schema` / `pg_catalog` (no RLS bypass needed for DDL metadata).
Cross-link probe for `claim_id` / `work_order_id` / `vendor_bill_id` / `expense_id` /
`insurance_claim_id` across the four tables returned **empty** — none of those missing hops exist on prod.

| Table | Canonical name | Existing relevant columns (prod) | Existing claim FK |
|---|---|---|---|
| Claim | `insurance.claim` | `id`, `tenant_id`, `operating_company_id`, `policy_id`, `asset_id`, `accident_report_id`, `load_id`, `driver_id`, economics cols (`fault` / `driver_responsible` / `trailer_id` / `deductible_cents` / `recovery_rail` / `repair_books_treatment` — already live) | — (this is the target) |
| Work order | `maintenance.work_orders` | `id`, `operating_company_id`, `unit_id`, `driver_id`, `load_id`, `vendor_id`, `display_id`, … | **none** (no `claim_id` / `insurance_claim_id`) |
| Vendor bill | `accounting.bills` | `id`, `operating_company_id`, `vendor_id`/`vendor_uuid` (soft text), **`linked_work_order_uuid`** → `maintenance.work_orders(id)` (`bills_linked_work_order_uuid_fkey`), **`unit_id`** → `mdata.units`, `mdata_vendor_id`, … | **none** |
| Expense | `accounting.expenses` | `id`, `operating_company_id`, `driver_uuid`, `load_id`, **`linked_work_order_uuid`** → `maintenance.work_orders(id)` (`expenses_linked_work_order_uuid_fkey`), **`unit_id`**, … | **none** |

**Already wired (do NOT re-touch):** WO ↔ Bill/Expense hard FK (`linked_work_order_uuid` +
`unit_id`) — live per `docs/trackers/LAW-E2E-MAINTENANCE-WO-BILL-LINKAGE-2026-07-21.md`. Claim → its
own accident/load/driver forward FKs — held, `202607410000`. This design closes the one hop still
missing: **Claim → WO** and **Claim → Bill/Expense** (direct, for claim costs that never route through
a work order — e.g. a deductible payment or a third-party repair invoice paid without an internal WO).

## 2. Design — columns/FKs to add

| Table | New column | Type | FK target | On delete | Index |
|---|---|---|---|---|---|
| `maintenance.work_orders` | `insurance_claim_id` | `uuid` NULL | `insurance.claim(id)` | `SET NULL` | `idx_work_orders_insurance_claim` (partial, `WHERE insurance_claim_id IS NOT NULL`) |
| `accounting.bills` | `insurance_claim_id` | `uuid` NULL | `insurance.claim(id)` | `SET NULL` | `idx_bills_insurance_claim` (partial) |
| `accounting.expenses` | `insurance_claim_id` | `uuid` NULL | `insurance.claim(id)` | `SET NULL` | `idx_expenses_insurance_claim` (partial) |

**Naming:** `insurance_claim_id`, matching the established convention for every existing FK that
already points INTO `insurance.claim` — `legal.matters.insurance_claim_id`,
`safety.accident_reports.insurance_claim_id`, `safety.incidents.auto_created_claim_id`. A bare
`claim_id` would be avoidable naming drift.

**Why nullable, no backfill:** every new column is all-NULL on add, so the inline `REFERENCES` FK
holds trivially (no `NOT VALID`, no data migration). Mirrors the exact pattern already used for
`202607410000` (claim's own forward FKs) and `202607050810` (WO↔bill/expense unit_id add).

**RLS/grants:** unchanged. All three target tables already carry FORCED RLS scoped on
`operating_company_id` (bills/expenses/work_orders) or `tenant_id` (claim, same value per
`202607410000`'s comment). A new nullable column inherits the table's existing policy + grants — no
new policy, no new grant, no `security_invoker` change.

**No GL/posting, no flag flip:** pure schema linkage. Posting claim-linked money to the GL is a
separate, later design (out of scope here, consistent with every other claim-economics slice to date).

## 3. Migration + guard shipped in this PR

- `db/migrations/202607740000_claim_wo_bill_expense_fk_linkage.sql` — held (`DO NOT RUN ON PROD`),
  additive, idempotent (`ADD COLUMN IF NOT EXISTS`).
- `db/migrations/.held-migrations.json` — new entry registered (bidirectional parity enforced by
  `verify-hold-migrations-registered.mjs`).
- `scripts/verify-claim-wo-bill-expense-fk-design.mjs` (+ verify-step
  `scripts/verify-steps/1264-verify-claim-wo-bill-expense-fk-design.mjs`) — static guard that fails
  closed if: the migration loses its DO-NOT-RUN marker, the three columns/FKs/indexes don't match this
  design exactly, naming drifts to bare `claim_id`, any GL/JE/flag-flip is smuggled in, a column is
  made `NOT NULL` (would require a backfill this design deliberately avoids), the registry entry is
  missing/unlabeled, or the claim-graph API's honest `gaps.expense` / `gaps.work_order` strings are
  removed before the columns are actually live (removing the evidence of a gap ≠ closing the gap).

**This PR intentionally does NOT:**
- Touch `apps/backend/src/insurance/claim.routes.ts` logic, any WO/bill/expense route, or any
  frontend creator/picker — no code wiring until Jorge Neon-applies the migration (audit-first
  discipline, matching `LAW-E2E-CLAIM-LEGAL-EXPENSE-LINKAGE-2026-07-21.md`'s "no code fixes in this
  PR").
- Add `driver_finance.driver_settlement_deductions` claim-source FK (the graph API's third documented
  gap) — separate settlement-recovery design, out of this block's 12/22 scope.
- Add `legal.matters` money linkage — `legal.matters` already has `insurance_claim_id` /
  `insurance_lawsuit_id` (a different, already-solved gap).
- Post anything to the GL, or backfill any existing row.

## 4. Exact Neon SQL for Jorge to paste (Tier-1 ceremony)

Run this **only on a Neon branch** (never directly on the `br-fancy-credit-akjnd07a` prod branch),
verify column-not-exists first, apply, confirm, then apply the same statements on prod, then
ledger-backfill so `db:migrate` skips the file on the next deploy.

```sql
BEGIN;

-- 1. maintenance.work_orders
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_insurance_claim
  ON maintenance.work_orders (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

-- 2. accounting.bills
ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_insurance_claim
  ON accounting.bills (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

-- 3. accounting.expenses
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_insurance_claim
  ON accounting.expenses (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

COMMIT;
```

**Pre-apply verification (run first, expect all three to return 0 rows / false before applying):**

```sql
SELECT table_schema, table_name, column_name
  FROM information_schema.columns
 WHERE table_schema IN ('maintenance', 'accounting')
   AND table_name IN ('work_orders', 'bills', 'expenses')
   AND column_name = 'insurance_claim_id';
```

**Post-apply verification (RLS bypass, same transaction):**

```sql
SELECT set_config('app.bypass_rls', 'lucia', true);
SELECT conname, conrelid::regclass, confrelid::regclass
  FROM pg_constraint
 WHERE conname IN (
   'work_orders_insurance_claim_id_fkey',
   'bills_insurance_claim_id_fkey',
   'expenses_insurance_claim_id_fkey'
 );
```

(Actual generated FK constraint names may differ slightly by Postgres version's inline-FK naming —
confirm via `\d maintenance.work_orders` / `\d accounting.bills` / `\d accounting.expenses` if the
above returns 0 rows.)

**After Neon-apply:** ledger-backfill the migration filename into whatever ledger table
`scripts/db-migrate.mjs` consults so prod `db:migrate` skips it on the next deploy, per the existing
firewall (`shouldSkipHeldOnProd`) — same ceremony already used for every other entry in
`.held-migrations.json` marked `"applied_on_prod": true`.

## 5. Follow-up (separate CODE PR, after Neon-apply — not in this PR)

1. `claim.routes.ts` graph endpoint: read `insurance_claim_id` from WO/bill/expense via a column
   capability probe (same `getClaimColumnCapabilities` pattern as the held economics slice) and stop
   reporting the now-closed `gaps.expense` / `gaps.work_order` strings.
2. "+ Create WO from claim" / "+ Create bill/expense from claim" creators that set the new FK +
   copy driver/unit context from the claim (LAW-E2E tracker's ranked fix #1).
3. Reverse EntityLinks: WO detail / Bill detail / Expense detail → claim; ClaimsTab / claim detail →
   linked WOs/bills/expenses.
4. Driver/unit profile reverse panels showing claim-linked WOs/bills/expenses.

Until (1)–(4) ship and are live-verified, this migration alone does **not** satisfy Rule 21 / Law §9's
full linkage bar — it only unblocks the FK layer. Do not claim the 12/22 item "done" from this PR
alone; it is the HOLD-for-Jorge schema half only.
