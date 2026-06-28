# Amortization (Loans / Intangibles) — Data-Model Spec — Migration-Ready

**Status:** Design / Docs only. No code, no DDL executed, no posting. This document DEFINES the migration
Claude Coder will build; Cascade never writes a migration. Build gated behind a flag default OFF;
GUARD verifies vs QuickBooks before merge. BUILD-AND-HOLD.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Standard cited:** effective-interest method (ASC 835-30 interest; ASC 350 for intangible
amortization). Fixed-payment (French) amortization for loans.
**Supersedes for data-model purposes:** `FH-3-AMORTIZATION-ENGINE-DESIGN.md` §2 (table sketch).
**Pattern source (proven sibling):** `db/migrations/202606271610_prepaid_expenses_data_model.sql`
(cents spine · RLS ENABLE+FORCE · soft-delete · audit cols · posting gated by feature flag).

> **FH-2 Loan Wizard note:** FH-2 (#1023) is in flight and CONSUMES this engine. Verify FH-2's state
> before any build; this spec is the schedule/posting foundation, not the wizard UI.

---

## 0. Scope and the QBO gap

QuickBooks has **no built-in amortization engine** — it cannot generate a principal/interest schedule
and auto-post the split payment. This model adds: a loan/liability register, a regeneratable
amortization schedule (principal + interest per period), and a **gated** auto-post of the split
payment JE. Two callers: **FH-2 Loan Wizard** (equipment/asset loans) and **standalone** (intangible
amortization or any term debt). All amounts integer **cents**; rates exact decimals.

## 1. Schema choice
Tables live in the canonical **`accounting`** schema for consistency with the shipped UI-1 siblings
(`accounting.prepaid_assets`) and the C1/C2 finance-hub specs. (FH-3 proposed a `finance.*` schema; if
a dedicated finance schema is preferred it must be registered canonical so the CC-02 one-dir /
deprecated-schema guards accept it — **flag to Jorge before the migration**.)

## 2. The math (engine builds this)
Fixed-payment (French): monthly rate `i = annual_rate / 12`; payment
`A = P·i / (1 − (1+i)^(−n))` (`P` = financed principal, `n` = term months). If `i = 0`, `A = P/n`.
Per period: `interest_k = balance·i`; `principal_k = A − interest_k`; `balance −= principal_k`.
**Rounding (locked):** integer cents; the **final payment absorbs the residual** so balance closes
to exactly 0. Supports **balloon** + **interest-only** as inputs (default fully-amortizing). Variable
rate handled by re-generation at reset (§5).

---

## 3. Tables

```sql
-- 3.1 Loan / liability register
CREATE TABLE IF NOT EXISTS accounting.loans (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  loan_number                 text,
  lender_name                 text        NOT NULL,
  description                 text,
  original_principal_cents    bigint      NOT NULL CHECK (original_principal_cents > 0),
  annual_rate_bps             int         NOT NULL CHECK (annual_rate_bps >= 0),  -- basis points (exact)
  term_months                 int         NOT NULL CHECK (term_months > 0),
  first_payment_date          date        NOT NULL,
  amortization_type           text        NOT NULL DEFAULT 'fully_amortizing'
                                CHECK (amortization_type IN ('fully_amortizing','balloon','interest_only')),
  balloon_amount_cents        bigint      CHECK (balloon_amount_cents IS NULL OR balloon_amount_cents >= 0),
  -- linked asset (FH-1 fixed asset) when this loan financed an asset
  fixed_asset_id              uuid        REFERENCES accounting.fixed_assets(id),
  -- GL accounts
  liability_account_id        uuid        REFERENCES catalogs.accounts(id),   -- Note/Loan Payable
  interest_expense_account_id uuid        REFERENCES catalogs.accounts(id),
  payment_account_id          uuid        REFERENCES catalogs.accounts(id),   -- Cash/bank
  current_schedule_id         uuid,       -- FK set after schedule insert (see 3.2)
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','paid','refinanced','voided')),
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_company_number
  ON accounting.loans (operating_company_id, loan_number) WHERE loan_number IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_loans_company_status ON accounting.loans (operating_company_id, status);

-- 3.2 Amortization schedule header (regeneratable; supersede on refinance)
CREATE TABLE IF NOT EXISTS accounting.amortization_schedules (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  loan_id                     uuid        NOT NULL REFERENCES accounting.loans(id) ON DELETE RESTRICT,
  generated_at                timestamptz NOT NULL DEFAULT now(),
  basis_principal_cents       bigint      NOT NULL CHECK (basis_principal_cents > 0),
  basis_annual_rate_bps       int         NOT NULL CHECK (basis_annual_rate_bps >= 0),
  basis_term_months           int         NOT NULL CHECK (basis_term_months > 0),
  supersedes_schedule_id      uuid        REFERENCES accounting.amortization_schedules(id),
  is_current                  boolean     NOT NULL DEFAULT true,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS idx_amort_sched_loan ON accounting.amortization_schedules (operating_company_id, loan_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_amort_sched_current
  ON accounting.amortization_schedules (loan_id) WHERE is_current = true AND is_active = true;

-- 3.3 Amortization period rows (one per payment)
CREATE TABLE IF NOT EXISTS accounting.amortization_periods (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  schedule_id                 uuid        NOT NULL REFERENCES accounting.amortization_schedules(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  due_date                    date        NOT NULL,
  payment_cents               bigint      NOT NULL CHECK (payment_cents >= 0),
  principal_cents             bigint      NOT NULL CHECK (principal_cents >= 0),
  interest_cents              bigint      NOT NULL CHECK (interest_cents >= 0),
  remaining_balance_cents     bigint      NOT NULL CHECK (remaining_balance_cents >= 0),
  status                      text        NOT NULL DEFAULT 'scheduled'
                                CHECK (status IN ('scheduled','posted','skipped','voided')),
  posted_journal_entry_id     uuid        REFERENCES accounting.journal_entries(id),
  posted_at                   timestamptz,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_amort_period_active
  ON accounting.amortization_periods (schedule_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_amort_period_pending
  ON accounting.amortization_periods (operating_company_id, due_date) WHERE status = 'scheduled' AND is_active = true;
```

## 4. Grants + RLS (ENABLE + FORCE)
```sql
GRANT SELECT, INSERT, UPDATE ON accounting.loans                   TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.amortization_schedules  TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.amortization_periods    TO ih35_app;
```
Per table: `ENABLE` + `FORCE ROW LEVEL SECURITY` + the company-scope policy
(`identity.is_lucia_bypass() OR operating_company_id = current_setting('app.operating_company_id', true)::uuid`),
identical to the prepaid sibling. Ships RLS FORCE-ON from day one.

## 5. Feature flag (posting GATED OFF) + regeneration
```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('LOAN_AMORTIZATION_ENABLED', 'FH-3 Amortization — loan register + schedule (read/compute). Posting OFF.', false),
  ('LOAN_AMORTIZATION_AUTOPOST_ENABLED', 'FH-3 Amortization — auto-post split payment JE on due date. Default OFF. GUARD-gated.', false)
ON CONFLICT (flag_key) DO NOTHING;
```
- OFF → schedule computed/visible, balanced-JE preview returned, posting **refused** (fail-loud).
- **Refinance/regenerate:** new schedule with `supersedes_schedule_id` set + `is_current=true`; old
  schedule retained (audited); already-posted periods stay posted; future unposted periods voided
  (VOID ≠ DELETE); remaining balance carries into the new schedule's opening principal.

## 6. Posting (gated, per due date) + sample balanced JE
On each period's due date (idempotent per `(schedule_id, period_number)`; closed period blocks posting):

| Leg | Account | Debit | Credit |
|---|---|---|---|
| 1 | Note/Loan Payable (principal_k) | `principal_cents` | |
| 2 | Interest Expense (interest_k) | `interest_cents` | |
| 3 | Cash / bank (payment) | | `payment_cents` |

**Example** (P=$50,000.00, 6.00% APR, 60 mo → A=$966.64; period 1: interest=$250.00, principal=$716.64):
`Dr Note Payable 71,664 + Dr Interest Expense 25,000 / Cr Cash 96,664` (cents) — sums balance (96,664 = 96,664). The three legs post atomically or fail hard.

## 7. Instructions for Coder
1. ONE migration in `db/migrations/`, timestamp sorting after the last applied. Tables (§3) + grants/RLS
   (§4) + flags (§5). Idempotent, cents spine, audit cols — like the prepaid sibling.
2. No posting code in the migration (engine code, gated by §5 flags, separate PR).
3. After inserting a schedule, set `loans.current_schedule_id`. Confirm `accounting.fixed_assets` exists
   (C1 migration) before adding that FK, or make it nullable/deferred.
4. BUILD-AND-HOLD. Tier-1 (creates tables) → JORGE-APPROVED + GUARD branch-verify.

## 8. Acceptance
DDL implementable as-is; effective-interest/French math cited; posting gated OFF; sample 3-leg JE
balances; refinance supersede+void-future+audit defined; per-entity RLS, no global rows.

## 9. DO NOT
- DO NOT flip either flag (D5). DO NOT post in the data-model migration (tables only).
- DO NOT add a new schema without flagging. DO NOT share loans across entities (TRK/TRANSP/USMCA separate).
