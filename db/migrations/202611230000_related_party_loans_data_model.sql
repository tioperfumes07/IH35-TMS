-- [FINANCIAL-CLUSTER] LOAN-01 — Loans & Advances ("Loan Applicator") canonical data model.
-- POSTS NOTHING. Additive: two new tables + FORCE RLS + grants + indexes. No existing row touched,
-- no column dropped, no schema altered. Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- WHAT THIS CARRIES: both directions of related-party lending.
--   direction 'in'  = someone funds a company obligation  -> a LIABILITY rises  (owner/spouse/friend loan)
--   direction 'out' = the company lends to a person       -> a RECEIVABLE rises (employee/driver loan)
--
-- WHY NEW TABLES RATHER THAN REUSING finance.loans — verified on prod 2026-08-03, not assumed:
--   finance.loans is LIVE (visible 1 == n_live_tup 1, n_tup_ins 1) and its columns are
--   original_principal_cents, interest_rate_bps, term_months, first_payment_date,
--   gl_liability_account_id, gl_interest_expense_account_id, payment_account_id.
--   That shape is COMPANY-BORROWS ONLY: there is no direction, no counterparty, no receivable account,
--   no target document. It cannot represent a loan OUT, which is half of this feature. Forcing it to
--   would mean overloading gl_liability_account_id to sometimes hold an asset — the kind of silent
--   polymorphism that makes a balance sheet lie.
--   The AMORTIZATION MODEL is reused as designed: related_party_loan_schedule mirrors
--   finance.loan_amortization_rows column-for-column (payment_number/due_date/payment_cents/
--   principal_cents/interest_cents/remaining_balance_cents/posted/posted_journal_entry_id) so there is
--   ONE amortization vocabulary in the system — but it FKs the new entries table, because a schedule
--   row must point at the loan it belongs to and finance.loans cannot hold a loan-out.
--   Schema is accounting.* per the standing invariant ("never finance.*"); finance.loans is left
--   untouched and unwritten.
--
-- RLS: FORCE RLS with the is_lucia_bypass() branch IN THE USING CLAUSE. This is deliberate and is the
-- lesson of 2026-08-03: a policy written as a bare `operating_company_id = current_setting(...)` with
-- NO bypass branch is AND-gated, so an audit read under bypass returns 0 REGARDLESS OF CONTENTS and a
-- masked zero gets published as fact. Five catalogs.* policies already have that defect. These tables
-- ship with the branch so they can be audited honestly from day one.

-- CANONICAL-CHECK: related_party_loan_entries. Money-concept = RELATED-PARTY LOAN (both directions).
-- The colliding canonical table is finance.loans, and it is addressed here rather than ignored:
-- finance.loans is LIVE on prod (visible 1 == n_live_tup 1, n_tup_ins 1) and remains the canonical home
-- of COMPANY-BORROWS institutional debt — its columns are original_principal_cents, interest_rate_bps,
-- term_months, gl_liability_account_id, gl_interest_expense_account_id, payment_account_id. It has NO
-- direction, NO counterparty, NO receivable account and NO target document, so it cannot represent a
-- loan OUT (company lends to a person), which is half of this feature. Representing a loan-out in
-- finance.loans would require overloading gl_liability_account_id to sometimes hold an ASSET — a silent
-- polymorphism that makes the balance sheet lie. This table is therefore NOT a second ledger for the
-- same concept: it is the related-party lending register (owner/spouse/employee/driver, in AND out),
-- and finance.loans is left untouched and unwritten by this feature. The GL itself is unchanged —
-- money continues to live ONLY in accounting.journal_entries / journal_entry_postings, which this table
-- references via je_id and never duplicates.
--
-- CANONICAL-CHECK: related_party_loan_schedule. Money-concept = AMORTIZATION SCHEDULE ROWS. The
-- colliding canonical table is finance.loan_amortization_rows, and it is addressed rather than ignored:
-- its COLUMN SHAPE is deliberately mirrored here column-for-column (payment_number, due_date,
-- payment_cents, principal_cents, interest_cents, remaining_balance_cents, posted,
-- posted_journal_entry_id) so the system keeps ONE amortization vocabulary. It is not reused as a TABLE
-- because its loan_id FKs finance.loans, which (per the block above) cannot hold a loan-out; a schedule
-- row must point at the loan it actually belongs to. No balance is reported off this table and nothing
-- posts from it — posting happens through the shared poster onto journal_entries, and each paid row
-- records the resulting posted_journal_entry_id.

BEGIN;

DO $$
BEGIN
  -- ── entries ────────────────────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounting.related_party_loan_entries (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
    direction             text NOT NULL CHECK (direction IN ('in','out')),
    relationship          text NOT NULL CHECK (relationship IN
                            ('owner','spouse','friend','employee','related_company','other')),
    counterparty_kind     text NOT NULL CHECK (counterparty_kind IN ('user','driver','vendor','company','other')),
    counterparty_id       uuid,
    counterparty_name     text,
    -- The liability account for direction 'in', the receivable account for direction 'out'.
    account_id            uuid NOT NULL REFERENCES catalogs.accounts(id),
    target_type           text NOT NULL CHECK (target_type IN
                            ('bill','settlement','cash_advance','expense','loan_out','repayment','intercompany')),
    target_id             uuid,
    principal_cents       bigint NOT NULL CHECK (principal_cents > 0),
    entry_date            date NOT NULL,
    -- Terms. interest_rate_bps mirrors finance.loans so APR is expressed identically system-wide.
    interest_rate_bps     integer NOT NULL DEFAULT 0 CHECK (interest_rate_bps >= 0),
    interest_method       text CHECK (interest_method IN ('simple','amortized','none')),
    payment_frequency     text CHECK (payment_frequency IN
                            ('weekly','biweekly','semimonthly','monthly','per_settlement','lump_sum')),
    payment_count         integer CHECK (payment_count IS NULL OR payment_count > 0),
    first_payment_date    date,
    funding_source_note   text,
    -- NOT NULL is enforced ON POST by the poster + the linkage guard, not by the column: an entry is
    -- created in the wizard before its JE exists. A NOT NULL here would make the draft unwritable.
    je_id                 uuid REFERENCES accounting.journal_entries(id),
    related_party         boolean NOT NULL DEFAULT true,
    status                text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','paid','reversed')),
    -- void-not-delete: a reversal points at what it reverses; nothing is ever DELETEd.
    reversed_of           uuid REFERENCES accounting.related_party_loan_entries(id),
    reversed_at           timestamptz,
    is_active             boolean NOT NULL DEFAULT true,
    deleted_at            timestamptz,
    created_by_user_id    uuid REFERENCES identity.users(id),
    updated_by_user_id    uuid REFERENCES identity.users(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
  );

  -- ── schedule (amortization) ────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounting.related_party_loan_schedule (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id     uuid NOT NULL REFERENCES org.companies(id),
    loan_id                  uuid NOT NULL REFERENCES accounting.related_party_loan_entries(id),
    payment_number           integer NOT NULL CHECK (payment_number > 0),
    due_date                 date NOT NULL,
    payment_cents            bigint NOT NULL CHECK (payment_cents >= 0),
    principal_cents          bigint NOT NULL CHECK (principal_cents >= 0),
    interest_cents           bigint NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),
    remaining_balance_cents  bigint NOT NULL CHECK (remaining_balance_cents >= 0),
    posted                   boolean NOT NULL DEFAULT false,
    posted_journal_entry_id  uuid REFERENCES accounting.journal_entries(id),
    is_active                boolean NOT NULL DEFAULT true,
    deleted_at               timestamptz,
    created_by_user_id       uuid REFERENCES identity.users(id),
    updated_by_user_id       uuid REFERENCES identity.users(id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT related_party_loan_schedule_seq_uniq UNIQUE (loan_id, payment_number)
  );
END $$;

-- ── indexes (entity-scoped lookups the registers actually run) ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rpl_entries_company_direction
  ON accounting.related_party_loan_entries (operating_company_id, direction);
CREATE INDEX IF NOT EXISTS idx_rpl_entries_company_target
  ON accounting.related_party_loan_entries (operating_company_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_rpl_entries_company_counterparty
  ON accounting.related_party_loan_entries (operating_company_id, counterparty_kind, counterparty_id);
CREATE INDEX IF NOT EXISTS idx_rpl_entries_je
  ON accounting.related_party_loan_entries (je_id);
CREATE INDEX IF NOT EXISTS idx_rpl_schedule_loan_due
  ON accounting.related_party_loan_schedule (loan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_rpl_schedule_company_open
  ON accounting.related_party_loan_schedule (operating_company_id, posted, due_date);

-- ── FORCE RLS + entity scope (bypass branch present — see header) ─────────────────────────────────
ALTER TABLE accounting.related_party_loan_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.related_party_loan_entries  FORCE  ROW LEVEL SECURITY;
ALTER TABLE accounting.related_party_loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.related_party_loan_schedule FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpl_entries_select ON accounting.related_party_loan_entries;
DROP POLICY IF EXISTS rpl_entries_write  ON accounting.related_party_loan_entries;
CREATE POLICY rpl_entries_select ON accounting.related_party_loan_entries FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY rpl_entries_write ON accounting.related_party_loan_entries FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS rpl_schedule_select ON accounting.related_party_loan_schedule;
DROP POLICY IF EXISTS rpl_schedule_write  ON accounting.related_party_loan_schedule;
CREATE POLICY rpl_schedule_select ON accounting.related_party_loan_schedule FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY rpl_schedule_write ON accounting.related_party_loan_schedule FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── grants (new schema objects need explicit grants or they 500 at runtime) ────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.related_party_loan_entries  TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.related_party_loan_schedule TO ih35_app;

-- ── fail closed: prove the tables, RLS and the bypass branch are all actually in place ─────────────
DO $$
DECLARE v_missing int;
BEGIN
  IF to_regclass('accounting.related_party_loan_entries') IS NULL
     OR to_regclass('accounting.related_party_loan_schedule') IS NULL THEN
    RAISE EXCEPTION 'LOAN-01: table(s) not created';
  END IF;

  SELECT count(*) INTO v_missing
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='accounting'
    AND c.relname IN ('related_party_loan_entries','related_party_loan_schedule')
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'LOAN-01: % table(s) missing FORCE ROW LEVEL SECURITY', v_missing;
  END IF;

  -- The bypass branch is the difference between an auditable table and a false-zero factory.
  SELECT count(*) INTO v_missing
  FROM pg_policies
  WHERE schemaname='accounting'
    AND tablename IN ('related_party_loan_entries','related_party_loan_schedule')
    AND coalesce(qual,'') NOT LIKE '%is_lucia_bypass%';
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'LOAN-01: % policy(ies) lack the is_lucia_bypass() branch (AND-gated = false zeros)', v_missing;
  END IF;
END $$;

COMMIT;
