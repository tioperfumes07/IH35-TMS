-- FACTORING (Faro) — daily Default-Interest accrual ledger. FINANCIAL / §1.4 gated. BUILD-AND-HOLD:
-- never self-merge — show full SQL + `git diff --staged --stat`, WAIT for Jorge's explicit "OK to merge".
-- The GL-posting flag (FACTORING_GL_POSTING_ENABLED) stays OFF at merge; this table is written ONLY by the
-- daily accrual cron/poster (Dr Default-Interest-Expense / Cr Factoring-Advance-Liability) when that flag is
-- ON for TRANSP. It is an append-only, per-(advance, day) compounding ledger that:
--   * makes the 0.067%/day-compounded-daily default interest (contract: after day 30 term + 5 grace = day
--     35) deterministic and idempotent — exactly one row per (advance, accrual_date);
--   * carries the running compounded balance (opening → interest → closing) so the next day compounds off it;
--   * links the accrual → the posted journal entry (journal_entry_id) → the factoring advance → (via the
--     advance) the pledged customer invoice / A/R (TOTAL CONNECTIVITY, forward + reverse).
-- Authored from faro-factoring-contract-terms + blueprint §6 + the ih35-financial-migrations skill.
-- Idempotent, CREATE-only, entity-scoped FORCED RLS, void-not-delete (is_active), self-contained grants.

BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;

-- ── factoring_default_interest_accruals — one row per (advance, accrual_date) ────────────────────────
CREATE TABLE IF NOT EXISTS accounting.factoring_default_interest_accruals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL,
  factoring_advance_id   uuid NOT NULL REFERENCES accounting.factoring_advances(id),
  accrual_date           date NOT NULL,             -- the calendar day interest is charged for (America/Chicago)
  day_index              integer NOT NULL,          -- days since Purchase Date (advance.advanced_at)
  daily_rate             numeric(12,8) NOT NULL,     -- 0.00067 = 0.067%/day (stored for auditability)
  opening_balance_cents  bigint NOT NULL CHECK (opening_balance_cents >= 0),
  interest_cents         bigint NOT NULL CHECK (interest_cents >= 0),
  closing_balance_cents  bigint NOT NULL CHECK (closing_balance_cents >= 0),
  journal_entry_id       uuid,                       -- link to the posted accounting.journal_entries row
  is_active              boolean NOT NULL DEFAULT true,   -- void-not-delete
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- idempotency spine: at most ONE accrual per advance per day (a re-run finds it and no-ops).
  CONSTRAINT factoring_default_interest_accruals_advance_day_uk
    UNIQUE (operating_company_id, factoring_advance_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS factoring_default_interest_accruals_advance_idx
  ON accounting.factoring_default_interest_accruals (factoring_advance_id, accrual_date)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS factoring_default_interest_accruals_je_idx
  ON accounting.factoring_default_interest_accruals (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- ── Entity-scoped FORCED RLS (canonical predicate; bypass for the is_lucia_bypass() poster path) ─────
ALTER TABLE accounting.factoring_default_interest_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_default_interest_accruals FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_default_interest_accruals_entity_all
  ON accounting.factoring_default_interest_accruals;
CREATE POLICY factoring_default_interest_accruals_entity_all
  ON accounting.factoring_default_interest_accruals FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── Grants: SELECT/INSERT/UPDATE only — NO DELETE (append-only / void-not-delete). accounting.* default
--    privileges may auto-grant DELETE, so REVOKE it explicitly. REVOKE trips the hold-merge-gate → correct:
--    this is a HOLD migration. ─────────────────────────────────────────────────────────────────────────
GRANT  USAGE ON SCHEMA accounting TO ih35_app;
GRANT  SELECT, INSERT, UPDATE ON accounting.factoring_default_interest_accruals TO ih35_app;
REVOKE DELETE ON accounting.factoring_default_interest_accruals FROM ih35_app;

COMMIT;
