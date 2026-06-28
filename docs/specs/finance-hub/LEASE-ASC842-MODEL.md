# Lease Accounting (ASC 842) — Data-Model Spec — Migration-Ready

**Status:** Design / Docs only. No code, no DDL executed, no posting. DEFINES the Coder migration;
Cascade never writes a migration. Gated default OFF; GUARD verifies vs QuickBooks. BUILD-AND-HOLD.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** **ASC 842 (Leases)** — lessee right-of-use (ROU) asset + lease liability; finance
vs operating classification.
**Pattern source:** `db/migrations/202606271610_prepaid_expenses_data_model.sql`.

> **Distinct from the shipped Truck Lease TEMPLATE (#1547).** That template is a **legal document**.
> THIS is the **accounting model** (ROU asset + lease liability + schedule + posting). They link by
> `lease_contract_id` but are different layers. Also supplements `FH-8-LEASE-CONTRACT-DESIGN.md`
> (operational inter-company monthly bill) — the ASC 842 tables here are additive to FH-8's
> `lease_contracts` / `lease_contract_units`.

---

## 0. The QBO gap
QBO has no ASC 842 engine (no ROU asset / lease liability recognition, no classification test, no
amortization/accretion schedule). This model adds it. All amounts integer cents; rates exact decimals.

## 1. ASC 842 scope for IH-35
- **Lessee (TRANSP)** applies ASC 842 first (where the live data is). **Lessor (TRK)** lessor
  accounting = phase 2.
- **Short-term expedient:** leases ≤ 12 months may expense straight-line with **no ROU/liability**
  (store the election).
- **Classification (ASC 842-10-25-2):** finance if ANY of — (1) ownership transfers, (2) purchase
  option reasonably certain, (3) term ≥ major part (~75%) of economic life, (4) PV of payments ≥
  substantially all (~90%) of fair value, (5) specialized asset, no alternative use. Else operating.
  Store inputs + result.

## 2. Measurement
- **Initial liability** = PV of remaining payments at the rate implicit (or incremental borrowing
  rate). **Initial ROU asset** = liability + initial direct costs + prepayments − incentives.
- **Finance lease subsequent:** effective-interest on liability + straight-line ROU amortization (two
  expenses). **Operating lease subsequent:** single straight-line lease cost; liability accretes; ROU
  = liability adjusted for straight-line vs cash timing (the ASC 842 plug).
- Schedule closes exactly to zero (final-period residual absorption).

---

## 3. Tables (additive to FH-8) — `accounting` schema

```sql
CREATE TABLE IF NOT EXISTS accounting.lease_asc842_recognitions (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  lease_contract_id           uuid        NOT NULL REFERENCES accounting.lease_contracts(id) ON DELETE RESTRICT,
  party_role                  text        NOT NULL DEFAULT 'lessee' CHECK (party_role IN ('lessee','lessor')),
  is_short_term               boolean     NOT NULL DEFAULT false,
  classification              text        NOT NULL DEFAULT 'operating' CHECK (classification IN ('operating','finance')),
  classification_test_json    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  commencement_date           date        NOT NULL,
  lease_term_months           int         NOT NULL CHECK (lease_term_months > 0),
  discount_rate_bps           int         NOT NULL CHECK (discount_rate_bps >= 0),
  initial_liability_cents     bigint      NOT NULL CHECK (initial_liability_cents >= 0),
  initial_rou_asset_cents     bigint      NOT NULL CHECK (initial_rou_asset_cents >= 0),
  initial_direct_costs_cents  bigint      NOT NULL DEFAULT 0,
  prepayments_cents           bigint      NOT NULL DEFAULT 0,
  incentives_cents            bigint      NOT NULL DEFAULT 0,
  rou_asset_account_id        uuid        REFERENCES catalogs.accounts(id),
  lease_liability_account_id  uuid        REFERENCES catalogs.accounts(id),
  interest_expense_account_id uuid        REFERENCES catalogs.accounts(id),
  amortization_account_id     uuid        REFERENCES catalogs.accounts(id),
  lease_expense_account_id    uuid        REFERENCES catalogs.accounts(id),
  initial_je_id               uuid        REFERENCES accounting.journal_entries(id),
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('draft','active','terminated','fully_amortized','voided')),
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_asc842_contract_role
  ON accounting.lease_asc842_recognitions (lease_contract_id, party_role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_asc842_company_status
  ON accounting.lease_asc842_recognitions (operating_company_id, status);

CREATE TABLE IF NOT EXISTS accounting.lease_asc842_schedule_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  recognition_id              uuid        NOT NULL REFERENCES accounting.lease_asc842_recognitions(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  payment_cents               bigint      NOT NULL CHECK (payment_cents >= 0),
  interest_cents              bigint      NOT NULL CHECK (interest_cents >= 0),
  principal_reduction_cents   bigint      NOT NULL CHECK (principal_reduction_cents >= 0),
  rou_amortization_cents      bigint      NOT NULL CHECK (rou_amortization_cents >= 0),
  liability_balance_end_cents bigint      NOT NULL CHECK (liability_balance_end_cents >= 0),
  rou_balance_end_cents       bigint      NOT NULL CHECK (rou_balance_end_cents >= 0),
  method_snapshot             text        NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_asc842_active_period
  ON accounting.lease_asc842_schedule_rows (recognition_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_asc842_pending
  ON accounting.lease_asc842_schedule_rows (operating_company_id, period_date) WHERE posted = false AND is_active = true;
```

## 4. Grants + RLS (ENABLE + FORCE)
```sql
GRANT SELECT, INSERT, UPDATE ON accounting.lease_asc842_recognitions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.lease_asc842_schedule_rows TO ih35_app;
```
Per table: `ENABLE` + `FORCE ROW LEVEL SECURITY` + the `operating_company_id` company-scope policy
identical to the prepaid sibling. Ships RLS FORCE-ON from day one.

## 5. Feature flags (posting GATED OFF)
```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('LEASE_ASC842_ENABLED', 'FH-8 ASC 842 — ROU asset + lease liability recognition + schedule (read/compute). Posting OFF.', false),
  ('LEASE_ASC842_POST_ENABLED', 'FH-8 ASC 842 — post initial recognition + monthly interest/amortization JEs. Default OFF. GUARD-gated.', false)
ON CONFLICT (flag_key) DO NOTHING;
```
OFF → schedule computed/visible, balanced-JE **preview** returned, posting **refused** (fail-loud).

## 6. JE shapes + sample balanced JE
- **Initial recognition:** Dr ROU Asset / Cr Lease Liability (+ Dr ROU for direct costs; Cr Cash for
  prepayments; Dr Liability for incentives).
- **Finance lease, monthly:** Dr Interest Expense (accretion) + Dr Amortization Expense / Cr Lease
  Liability (principal reduction) + Cr Accumulated ROU Amortization; Cr Cash (payment).
- **Operating lease, monthly:** Dr Lease Expense (straight-line) / Cr Cash, with liability accretion +
  ROU adjustment as the ASC 842 balancing entries.

**Example — operating lease, 36 mo, $2,000/mo, IBR 6.00% → initial liability ≈ $65,752 (PV):**
Initial: `Dr ROU Asset 6,575,200 / Cr Lease Liability 6,575,200` (cents) — balances. Month 1:
`Dr Lease Expense 200,000 / Cr Cash 200,000`; liability accretes `65,752×0.5% = 32,876` with the ROU
reduced by `200,000 − 32,876 = 167,124` (straight-line plug). Posts atomically or fails hard.

## 7. Inter-company note
TRK→TRANSP lease is intercompany: TRANSP (lessee) books ROU+liability+expense; TRK (lessor) books
income/receivable. On **consolidation** these eliminate — flag for the CONSOLIDATION design. Entity
separation absolute (TRK/TRANSP/USMCA never merged).

## 8. Instructions for Coder
1. ONE migration: the 2 tables (§3) + grants/RLS (§4) + flags (§5). Idempotent, cents spine, audit cols.
2. No posting in the migration. Confirm `accounting.lease_contracts` exists (FH-8 operational) before
   the FK — if not yet built, FH-8 operational tables land first or the FK is deferred.
3. BUILD-AND-HOLD. Tier-1 → JORGE-APPROVED + GUARD branch-verify.

## 9. Acceptance
DDL implementable as-is; ASC 842 cited; classification + measurement defined; posting gated OFF;
sample initial + monthly JEs balance; per-entity RLS; lessee-first sequencing; distinct from #1547 template.

## 10. DO NOT
- DO NOT flip either flag (D5). DO NOT post in the data-model migration (tables only).
- DO NOT conflate with the #1547 legal template. DO NOT add a new schema without flagging.
- DO NOT merge lease income/expense across entities (consolidation eliminates).
