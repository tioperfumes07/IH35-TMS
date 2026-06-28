# Revenue Recognition — Data-Model Spec (ASC 606) — Migration-Ready

**Status:** Design / Docs only. No code, no DDL executed, no posting. This document IS the migration
Claude Coder will build (Coder is the sole migration writer; Cascade never writes a migration file).
Build gated behind a flag default OFF; GUARD verifies vs QuickBooks before merge.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Pattern source (proven sibling):** `db/migrations/202606271610_prepaid_expenses_data_model.sql`
(cents spine · RLS ENABLE+FORCE · soft-delete · audit cols · posting gated by feature flag).
**Companion:** mirrors the structure of `FIXED-ASSETS-DATA-MODEL-2026-06-28.md`.

---

## 0. Scope and the QBO gap

QuickBooks Online has a "Revenue recognition" toggle (Advanced tier) that only handles **simple
straight-line deferral over a date range** on an invoice line. It does **not** model ASC 606's
five-step framework: multi-obligation contracts, standalone-selling-price allocation, or
point-in-time vs over-time recognition per obligation. This model closes that gap.

For a trucking TMS most freight revenue is **point-in-time** (recognized at delivery/POD). The
deferred-revenue machinery applies to: prepaid/subscription billing, detention/accessorial billed in
advance, multi-stop or multi-leg contracts with distinct obligations, and any cash-in-advance booking.

**ASC 606 (Revenue from Contracts with Customers)** five steps map to the tables below:
1. **Identify the contract** → `accounting.revenue_contracts`
2. **Identify performance obligations** → `accounting.revenue_obligations`
3. **Determine the transaction price** → `revenue_contracts.transaction_price_cents`
4. **Allocate price to obligations** → `revenue_obligations.allocated_price_cents` (by SSP)
5. **Recognize revenue as obligations are satisfied** → `accounting.revenue_recognition_rows`

All amounts integer **cents**. Every table carries `is_active` + soft-delete + audit columns,
tenant-scoped by `operating_company_id`, RLS ENABLE + FORCE.

---

## 1. Schema choice

Tables live in the existing canonical **`accounting`** schema (same as `accounting.prepaid_assets`),
NOT a new schema — consistency with the shipped UI-1 siblings + avoids new-schema guard churn.

---

## 2. Table: `accounting.revenue_contracts` (ASC 606 step 1 + 3)

```sql
CREATE TABLE IF NOT EXISTS accounting.revenue_contracts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_number             text,
  customer_uuid               uuid,                            -- mdata.customers (soft ref, parity w/ prepaid vendor_uuid)
  description                 text        NOT NULL,
  -- source linkage (a contract may originate from a load, an invoice, or be standalone)
  source_type                 text        NOT NULL DEFAULT 'standalone'
                                CHECK (source_type IN ('standalone','load','invoice','subscription')),
  source_load_id              uuid,                            -- dispatch/mdata loads (soft ref)
  source_invoice_id           uuid        REFERENCES accounting.invoices(id),
  -- ASC 606 step 3: total transaction price
  transaction_price_cents     bigint      NOT NULL CHECK (transaction_price_cents >= 0),
  currency_code               text        NOT NULL DEFAULT 'USD',
  contract_date               date        NOT NULL,
  start_date                  date        NOT NULL,
  end_date                    date,
  -- GL accounts
  deferred_revenue_account_id uuid        REFERENCES catalogs.accounts(id),
  ar_account_id               uuid        REFERENCES catalogs.accounts(id),
  -- recognition lifecycle
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('draft','active','fully_recognized','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  voided_at                   timestamptz,
  voided_by_user_id           uuid        REFERENCES identity.users(id),
  void_reason                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_contracts_company_number
  ON accounting.revenue_contracts (operating_company_id, contract_number)
  WHERE contract_number IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_revenue_contracts_company_status
  ON accounting.revenue_contracts (operating_company_id, status);

CREATE INDEX IF NOT EXISTS idx_revenue_contracts_customer
  ON accounting.revenue_contracts (operating_company_id, customer_uuid);
```

---

## 3. Table: `accounting.revenue_obligations` (ASC 606 step 2 + 4)

One row per distinct performance obligation. `allocated_price_cents` = the transaction price allocated
to this obligation by **standalone selling price (SSP)**. `recognition_method` decides point-in-time
vs over-time. The sum of `allocated_price_cents` across active obligations of a contract must equal the
contract `transaction_price_cents` (enforced in app/engine, not a DB constraint since it spans rows).

```sql
CREATE TABLE IF NOT EXISTS accounting.revenue_obligations (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_id                 uuid        NOT NULL REFERENCES accounting.revenue_contracts(id) ON DELETE RESTRICT,
  obligation_number           int         NOT NULL CHECK (obligation_number > 0),
  description                 text        NOT NULL,            -- e.g. 'Linehaul TX->IL', 'Detention', 'Fuel surcharge'
  standalone_selling_price_cents bigint   NOT NULL CHECK (standalone_selling_price_cents >= 0),
  allocated_price_cents       bigint      NOT NULL CHECK (allocated_price_cents >= 0),
  recognition_method          text        NOT NULL DEFAULT 'point_in_time'
                                CHECK (recognition_method IN ('point_in_time','over_time_straight_line','over_time_usage')),
  -- over-time params
  recognition_start_date      date,
  recognition_end_date        date,
  periods                     int         CHECK (periods IS NULL OR periods > 0),
  -- point-in-time trigger
  satisfied_at                timestamptz,                     -- set when delivered/POD for point_in_time
  satisfied_trigger          text        DEFAULT 'manual'
                                CHECK (satisfied_trigger IN ('manual','delivery_pod','invoice_paid')),
  revenue_account_id          uuid        REFERENCES catalogs.accounts(id),
  status                      text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','satisfied','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_obligations_contract_number
  ON accounting.revenue_obligations (contract_id, obligation_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_revenue_obligations_company_contract
  ON accounting.revenue_obligations (operating_company_id, contract_id);

CREATE INDEX IF NOT EXISTS idx_revenue_obligations_pending
  ON accounting.revenue_obligations (operating_company_id, status)
  WHERE status IN ('pending','in_progress') AND is_active = true;
```

---

## 4. Table: `accounting.revenue_recognition_rows` (ASC 606 step 5)

The recognition schedule. For point-in-time obligations: a single row at satisfaction. For over-time:
one row per period. `posted_journal_entry_id` links the recognition JE. Idempotent on
`(obligation_id, period_number)` among active rows.

```sql
CREATE TABLE IF NOT EXISTS accounting.revenue_recognition_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_id                 uuid        NOT NULL REFERENCES accounting.revenue_contracts(id) ON DELETE RESTRICT,
  obligation_id               uuid        NOT NULL REFERENCES accounting.revenue_obligations(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  recognized_amount_cents     bigint      NOT NULL CHECK (recognized_amount_cents >= 0),
  remaining_deferred_cents    bigint      NOT NULL DEFAULT 0 CHECK (remaining_deferred_cents >= 0),
  method_snapshot             text        NOT NULL,            -- method + formula at generation time
  posted                      boolean     NOT NULL DEFAULT false,
  posted_journal_entry_id     uuid        REFERENCES accounting.journal_entries(id),
  posted_at                   timestamptz,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_recognition_active_period
  ON accounting.revenue_recognition_rows (obligation_id, period_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_revenue_recognition_company_contract
  ON accounting.revenue_recognition_rows (operating_company_id, contract_id);

CREATE INDEX IF NOT EXISTS idx_revenue_recognition_pending
  ON accounting.revenue_recognition_rows (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;
```

---

## 5. Grants + RLS (ENABLE + FORCE) — exact pattern from prepaid sibling

```sql
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_contracts          TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_obligations        TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_recognition_rows   TO ih35_app;
```

For EACH of the three tables (template — repeat per table):

```sql
ALTER TABLE accounting.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.<table> FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS <table>_company_scope ON accounting.<table>;
CREATE POLICY <table>_company_scope ON accounting.<table> FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );
```

> Ships RLS FORCE-ON from day one — does not inherit the G3 FORCE-OFF debt.

---

## 6. Feature flags (posting GATED OFF)

```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('REVENUE_RECOGNITION_ENABLED',
   'UI-1 Revenue Recognition — ASC 606 contracts, obligations, recognition schedule (read/compute). GL posting OFF.',
   false),
  ('REVENUE_RECOGNITION_POST_ENABLED',
   'Revenue Recognition — post deferral + recognition JEs. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;
```

Behavior:
- `REVENUE_RECOGNITION_ENABLED` OFF → page hidden/shell. ON → contracts + schedule visible, no posting.
- `REVENUE_RECOGNITION_POST_ENABLED` OFF → balanced-JE **preview** always returned; posting **refused**
  (fail-loud). ON → recognition posts, idempotent per `(obligation_id, period_number)`.
- Same gating pattern as `PREPAID_EXPENSES_POST_ENABLED` / CHAIN-03.

---

## 7. JE shapes (preview always; post only when flag ON)

- **On billing in advance (cash/AR received before satisfaction):**
  Dr AR (or Cash) / Cr **Deferred Revenue** — for the unrecognized portion.
- **On recognition (step 5, per row):**
  Dr **Deferred Revenue** / Cr **Revenue** for `recognized_amount_cents`.
- **Point-in-time obligation:** single recognition row at `satisfied_at` (e.g. delivery/POD) → full
  allocated amount recognized at once.
- **Over-time straight-line:** allocated amount ÷ periods, integer-cents with remainder carried to the
  final period so the schedule sums exactly to the allocated amount.

Every JE must balance or fail hard; reuse `createJournalEntry` + period-close guard.

---

## 8. Recognition math (engine)

- **point_in_time** (BUILT first — covers most freight): recognize `allocated_price_cents` in full when
  `satisfied_at` is set (trigger: manual, delivery_pod, or invoice_paid).
- **over_time_straight_line** (BUILT): `period = allocated_price_cents / periods`, remainder to last period.
- **over_time_usage** (schema-supported, reference): recognize by usage proportion; engine later.

---

## 9. Idempotency + double-entry safety (locked)

- Unique `(obligation_id, period_number)` on active recognition rows + `posted` flag → recognize once.
- Allocation invariant (engine-enforced): Σ active `allocated_price_cents` per contract =
  `transaction_price_cents`. Σ recognized over the obligation life = its `allocated_price_cents`.
- VOID ≠ DELETE; superseded schedule rows soft-deleted on regeneration, never hard-deleted.

---

## 10. Instructions for Claude Coder (CC migration)

1. Migration-ready. Build as ONE migration in `db/migrations/`, timestamp sorting after the last applied.
2. Create the 3 tables (§2–§4), grants + RLS ENABLE+FORCE (§5), flags (§6). Idempotent, cents spine,
   audit cols — exactly like `202606271610_prepaid_expenses_data_model.sql`.
3. No posting code in the migration. Recognition/deferral posting is engine code, gated by §6 flags, separate PR.
4. Confirm `accounting.invoices`, `accounting.journal_entries`, `catalogs.accounts`, `org.companies`,
   `identity.users`, `lib.feature_flags` exist on the fresh-migrated schema (they do as of #1573).
   `customer_uuid` / `source_load_id` are intentionally soft refs (parity with prepaid `vendor_uuid`).
5. BUILD-AND-HOLD. Open PR, do not merge. Tier-1 (creates tables) → JORGE-APPROVED label + GUARD branch-verify.

---

## 11. DO NOT (mirrors permanent danger blocks)

- DO NOT enable either flag (D5 — no money flag flips).
- DO NOT post deferral/recognition JEs in the data-model migration (tables only).
- DO NOT build the over_time_usage engine yet (point-in-time + straight-line first).
- DO NOT add a new schema without flagging — this spec uses canonical `accounting`.
- DO NOT merge revenue across entities (TRK/TRANSP/USMCA separation is absolute).
