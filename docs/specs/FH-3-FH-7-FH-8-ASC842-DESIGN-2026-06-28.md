# FH-3 / FH-7 / FH-8 — Design-Spec Reconciliation + ASC 842 Lease Layer

**Status:** Design / Docs only. No code, no DDL executed, no posting. Gated build, GUARD-verified,
never self-merged. BUILD-AND-HOLD.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Purpose:** Reconcile the three existing Finance-Hub design specs (FH-3 Amortization, FH-7 Unit
Allocation, FH-8 Lease) against the current backlog, and **add the missing ASC 842 lessee-accounting
layer to FH-8** — the genuine net-new gap. FH-3 and FH-7 are already complete designs (2026-06-14);
this doc confirms their status and notes the migration-ready follow-ups, then specifies ASC 842 in full.

---

## Part A — FH-3 Amortization Engine — STATUS: design complete

`FH-3-AMORTIZATION-ENGINE-DESIGN.md` (2026-06-14) is complete and current:
- French fixed-payment math with final-residual close to zero (§1) — correct.
- Data model `finance.loans` / `finance.amortization_schedules` / `finance.amortization_periods` (§2).
- Gated 3-leg posting Dr Note Payable / Dr Interest Expense / Cr Cash (§3), idempotent per
  `(schedule_id, period#)`.
- Refinance regeneration with supersede + void-future + audit (§4).

**No redesign needed.** Two follow-ups for the Coder migration when it is built:
1. **Schema decision:** FH-3 proposes a `finance.*` schema. For consistency with the shipped UI-1
   siblings (which use `accounting.*`), flag to Jorge whether loans/amortization belong in `accounting`
   or a dedicated `finance` schema. Recommendation: a dedicated `finance` schema IS justified here
   (loans + calculators + bankruptcy modeler are a distinct hub domain), but it must be registered as
   canonical so the CC-02 one-dir / deprecated-schema guards accept it. Decide before the migration.
2. **Migration-ready DDL:** when greenlit, produce the table DDL with cents spine, RLS ENABLE+FORCE,
   audit cols, and the `LOAN_AMORTIZATION_AUTOPOST_ENABLED` flag (default OFF) — same pattern as
   `db/migrations/202606271610_prepaid_expenses_data_model.sql`.

---

## Part B — FH-7 Unit Allocation — STATUS: design complete (mostly reuse)

`FH-7-UNIT-ALLOCATION-DESIGN.md` (2026-06-14) is complete and current. The control already exists and
is generic (`accounting.bill_unit_allocation`, `resolveAllocation`, `BillAllocationPanel`). Net-new is
small and well-specified:
- Add **`manual_amount`** method (exact $/unit, must sum to total) to `resolveAllocation` + method
  picker + the `bill_unit_allocation` CHECK constraint.
- Generalize callers (taxes, lease) to reuse the one control.
- Per-unit cost-of-ownership reporting rollup.

**No redesign needed.** The only schema change is the CHECK-constraint extension to add `manual_amount`
to the allowed methods on `accounting.bill_unit_allocation` — a tiny Coder migration. FH-8 (Part C)
depends on this control; build FH-7's `manual_amount` first.

---

## Part C — FH-8 Lease — ASC 842 LESSEE ACCOUNTING LAYER (net-new design)

The existing `FH-8-LEASE-CONTRACT-DESIGN.md` covers the **operational** inter-company lease (TRK→TRANSP
monthly bill + FH-7 per-unit allocation). It does **NOT** address **ASC 842**, which requires the
lessee to recognize a **right-of-use (ROU) asset** and a **lease liability** on the balance sheet.
This part adds that layer. It supplements FH-8 §3 (does not replace it).

### C.1 ASC 842 in scope for IH-35

- **Lessee (TRANSP)** is the entity that applies ASC 842 for the inter-company lease (and any external
  equipment/property leases). **Lessor (TRK)** applies ASC 842 lessor accounting (sales-type / direct-
  financing / operating) — phase 2; this doc specifies the **lessee** side first (where TRANSP's books
  and the live data are, per FH-1 §1.4 sequencing).
- **Short-term exemption:** leases ≤ 12 months may elect the practical expedient — expense straight-
  line, **no ROU asset / liability**. Store the election per contract.
- **Classification (lessee):** **finance** vs **operating** lease via the ASC 842-10-25-2 tests:
  1. transfer of ownership at end of term;
  2. purchase option reasonably certain to exercise;
  3. lease term ≥ major part (≈75%) of remaining economic life;
  4. PV of payments ≥ substantially all (≈90%) of fair value;
  5. asset so specialized it has no alternative use to lessor.
  Any one true → **finance**; else **operating**. Store the test inputs + result.

### C.2 Measurement

- **Initial lease liability** = present value of remaining lease payments discounted at the rate
  implicit in the lease (or the lessee's incremental borrowing rate if implicit is not readily
  determinable). Store the discount rate (exact decimal) and the PV basis snapshot.
- **Initial ROU asset** = lease liability + initial direct costs + prepayments − lease incentives.
- **Subsequent — finance lease:** interest on the liability (effective-interest) + straight-line ROU
  amortization (two separate expenses). Liability reduces by (payment − interest).
- **Subsequent — operating lease:** single straight-line lease cost; liability accretes interest,
  ROU asset = liability adjusted for straight-line vs cash timing (the ASC 842 plug).
- All amounts integer cents; the amortization/accretion schedule closes exactly to zero (final-period
  residual absorption, same rule as FH-3 §1).

### C.3 Data model (supplements FH-8 §3) — `accounting` schema

> Reuses FH-8's `lease_contracts` / `lease_contract_units` for the operational bill. ASC 842 adds the
> balance-sheet recognition tables below. All `is_active` + soft-delete + audit cols, cents spine,
> tenant-scoped, RLS ENABLE+FORCE — same pattern as the prepaid sibling.

```sql
-- ASC 842 recognition header (one per lease contract per reporting entity/side)
CREATE TABLE IF NOT EXISTS accounting.lease_asc842_recognitions (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  lease_contract_id           uuid        NOT NULL REFERENCES accounting.lease_contracts(id) ON DELETE RESTRICT,
  party_role                  text        NOT NULL DEFAULT 'lessee'
                                CHECK (party_role IN ('lessee','lessor')),
  -- short-term practical expedient
  is_short_term               boolean     NOT NULL DEFAULT false,
  -- classification
  classification              text        NOT NULL DEFAULT 'operating'
                                CHECK (classification IN ('operating','finance')),
  classification_test_json    jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- the 5 test inputs + results
  -- measurement
  commencement_date           date        NOT NULL,
  lease_term_months           int         NOT NULL CHECK (lease_term_months > 0),
  discount_rate_bps           int         NOT NULL CHECK (discount_rate_bps >= 0), -- basis points (exact)
  initial_liability_cents     bigint      NOT NULL CHECK (initial_liability_cents >= 0),
  initial_rou_asset_cents     bigint      NOT NULL CHECK (initial_rou_asset_cents >= 0),
  initial_direct_costs_cents  bigint      NOT NULL DEFAULT 0,
  prepayments_cents           bigint      NOT NULL DEFAULT 0,
  incentives_cents            bigint      NOT NULL DEFAULT 0,
  -- GL accounts
  rou_asset_account_id        uuid        REFERENCES catalogs.accounts(id),
  lease_liability_account_id  uuid        REFERENCES catalogs.accounts(id),
  interest_expense_account_id uuid        REFERENCES catalogs.accounts(id),
  amortization_account_id     uuid        REFERENCES catalogs.accounts(id),
  lease_expense_account_id    uuid        REFERENCES catalogs.accounts(id), -- operating single cost
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
  ON accounting.lease_asc842_recognitions (lease_contract_id, party_role)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_lease_asc842_company_status
  ON accounting.lease_asc842_recognitions (operating_company_id, status);

-- ASC 842 amortization/accretion schedule (one row per period)
CREATE TABLE IF NOT EXISTS accounting.lease_asc842_schedule_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  recognition_id              uuid        NOT NULL REFERENCES accounting.lease_asc842_recognitions(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  payment_cents               bigint      NOT NULL CHECK (payment_cents >= 0),
  interest_cents              bigint      NOT NULL CHECK (interest_cents >= 0),       -- liability accretion
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
  ON accounting.lease_asc842_schedule_rows (recognition_id, period_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_lease_asc842_pending
  ON accounting.lease_asc842_schedule_rows (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;
```

### C.4 Grants + RLS (ENABLE + FORCE)

```sql
GRANT SELECT, INSERT, UPDATE ON accounting.lease_asc842_recognitions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.lease_asc842_schedule_rows TO ih35_app;
```
Per table: `ENABLE` + `FORCE ROW LEVEL SECURITY` + the `operating_company_id` company-scope policy
(`identity.is_lucia_bypass() OR operating_company_id = current_setting(...)`), identical to the prepaid
sibling.

### C.5 Feature flags (posting GATED OFF)

```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('LEASE_ASC842_ENABLED',
   'FH-8 ASC 842 — ROU asset + lease liability recognition + schedule (read/compute). GL posting OFF.',
   false),
  ('LEASE_ASC842_POST_ENABLED',
   'FH-8 ASC 842 — post initial recognition + monthly interest/amortization JEs. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;
```

### C.6 JE shapes (preview always; post only when flag ON)

- **Initial recognition:** Dr **ROU Asset** / Cr **Lease Liability** (+ Dr ROU for initial direct costs;
  Cr Cash for prepayments; Dr Lease Liability for incentives as applicable).
- **Finance lease, monthly:** Dr **Interest Expense** (accretion) + Dr **Amortization Expense**
  (straight-line ROU) / Cr **Lease Liability** (principal reduction) + Cr **Accumulated ROU
  Amortization**; Cr **Cash** for the payment.
- **Operating lease, monthly:** Dr single **Lease Expense** (straight-line) / Cr **Cash**; with the
  liability accretion and ROU adjustment booked as the ASC 842 balancing entries.
- Every JE balances or fails hard; reuse `createJournalEntry` + period-close guard. Idempotent per
  `(recognition_id, period_number)`.

### C.7 Inter-company note

The TRK→TRANSP lease is intercompany: TRANSP (lessee) recognizes ROU + liability + expense; TRK
(lessor) recognizes lease income / receivable. On **consolidation** these eliminate — flag for the
CONSOLIDATION design. Entity separation is absolute (TRK/TRANSP/USMCA never merged).

---

## Part D — Instructions for Claude Coder (when greenlit)

1. **FH-7 first:** extend `accounting.bill_unit_allocation` CHECK to add `manual_amount` (tiny migration).
2. **FH-3:** decide schema (`finance` vs `accounting`), then build the 3 loan/amortization tables +
   `LOAN_AMORTIZATION_AUTOPOST_ENABLED` flag — migration-ready DDL per the prepaid pattern.
3. **FH-8 ASC 842:** build the 2 tables in C.3 + grants/RLS (C.4) + flags (C.5). Reuse FH-8's existing
   `lease_contracts` / `lease_contract_units` for the operational bill; the ASC 842 tables are additive.
4. All migrations: idempotent, cents spine, RLS ENABLE+FORCE, audit cols, BUILD-AND-HOLD, Tier-1
   (creates tables) → JORGE-APPROVED label + GUARD branch-verify. Cascade does not write migrations.

## Part E — DO NOT

- DO NOT enable any flag (D5).
- DO NOT post any JE in a data-model migration (tables only).
- DO NOT add a new schema without flagging (FH-3 `finance` decision is explicit and gated).
- DO NOT merge lease income/expense across entities (consolidation eliminates; separation absolute).
- DO NOT fork a parallel allocation system — FH-8 reuses the FH-7 control (D-style reuse rule).
