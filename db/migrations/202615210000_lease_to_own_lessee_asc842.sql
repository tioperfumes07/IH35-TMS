-- RELEASED 2026-10-24 (LEAD 443.331): validated by the Lead on fresh production copies br-lingering-sky-aktlh2vt and br-dark-cell-akp4m0ee
-- (applied in order, rerun idempotent); removed from .held-migrations.json so prod db:migrate applies it at the next deploy.
-- 202615210000_lease_to_own_lessee_asc842.sql
-- HELD — (was: do-not-run-on-prod) until the Lead validates it on a Neon branch and applies it (CC-1 could not validate:
-- Neon write MCP 401 and local Postgres denied on 2026-10-02). Registered in db/migrations/.held-migrations.json
-- (verify:hold-migrations-registered). Fresh / CI databases apply it normally.
-- ROUND 321 (CC-1) — lease-to-own money side, ASC 842 LESSEE. Until now every ROUND 316 lease (lease_to_own included)
-- billed as flat rent expense; no right-of-use asset, no lease liability, no interest / principal split, no purchase
-- option, no buyout. This adds the lessee side:
--   * lease_contract: purchase option (none / fmv / fixed + price), lessee classification and the commencement JE.
--     Classification follows the owner's locked B1 rule (FMV purchase option -> OPERATING; fixed / payoff price ->
--     FINANCE); the engine derives it, the column records it.
--   * accounting.lease_lessee_schedule_period: one row per (lease asset line, period) — payment, interest, principal,
--     liability open/close, ROU amortization / close, straight-line lease cost — with the bill and accretion JE it
--     posted through (lease <-> bill <-> JE both ways). WORM (void-not-delete) + FORCE RLS per entity.
--   * COA roles rou_asset, lease_liability, accumulated_rou_amortization, lease_interest_expense — owner binds them on
--     the CoaRoles page; unbound -> the engine refuses with the role named (never guessed, no accounts seeded).
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS purchase_option_kind text;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS purchase_option_price_cents bigint;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS lessee_classification text;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS lessee_commencement_je_id uuid REFERENCES accounting.journal_entries(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS lessee_liability_initial_cents bigint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_purchase_option_kind_chk' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_purchase_option_kind_chk
      CHECK (purchase_option_kind IS NULL OR purchase_option_kind IN ('none', 'fmv', 'fixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_purchase_option_price_chk' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_purchase_option_price_chk
      CHECK ((purchase_option_kind = 'fixed' AND purchase_option_price_cents IS NOT NULL AND purchase_option_price_cents >= 0)
             OR (purchase_option_kind IS DISTINCT FROM 'fixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_lessee_classification_chk' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_lessee_classification_chk
      CHECK (lessee_classification IS NULL OR lessee_classification IN ('operating', 'finance'));
  END IF;
END $$;
COMMENT ON COLUMN accounting.lease_contract.purchase_option_kind IS 'ROUND 321: none | fmv | fixed. FMV -> operating, fixed -> finance (owner B1 rule).';
COMMENT ON COLUMN accounting.lease_contract.lessee_classification IS 'ROUND 321: ASC 842 lessee classification; NULL = not capitalized (legacy rent-expense lease).';

CREATE TABLE IF NOT EXISTS accounting.lease_lessee_schedule_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  lease_contract_id uuid NOT NULL REFERENCES accounting.lease_contract(id),
  lease_asset_line_id uuid NOT NULL REFERENCES accounting.lease_asset_line(id),
  period_no integer NOT NULL CHECK (period_no >= 1),
  period_start date NOT NULL,
  payment_cents bigint NOT NULL CHECK (payment_cents >= 0),
  interest_cents bigint NOT NULL,
  principal_cents bigint NOT NULL,
  liability_open_cents bigint NOT NULL,
  liability_close_cents bigint NOT NULL,
  rou_amortization_cents bigint NOT NULL,
  rou_close_cents bigint NOT NULL,
  lease_cost_cents bigint NOT NULL,
  bill_id uuid REFERENCES accounting.bills(id),
  accretion_je_id uuid REFERENCES accounting.journal_entries(id),
  posted_at timestamptz,
  voided_at timestamptz,
  voided_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  CONSTRAINT lease_lessee_schedule_period_ties CHECK (liability_close_cents = liability_open_cents - principal_cents AND principal_cents = payment_cents - interest_cents)
);
CREATE UNIQUE INDEX IF NOT EXISTS lease_lessee_schedule_period_active_uq
  ON accounting.lease_lessee_schedule_period (operating_company_id, lease_asset_line_id, period_no) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS lease_lessee_schedule_period_contract_idx ON accounting.lease_lessee_schedule_period (operating_company_id, lease_contract_id, period_start);
CREATE INDEX IF NOT EXISTS lease_lessee_schedule_period_bill_idx ON accounting.lease_lessee_schedule_period (bill_id);
CREATE INDEX IF NOT EXISTS lease_lessee_schedule_period_je_idx ON accounting.lease_lessee_schedule_period (accretion_je_id);

ALTER TABLE accounting.lease_lessee_schedule_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.lease_lessee_schedule_period FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_lessee_schedule_period_company_isolation ON accounting.lease_lessee_schedule_period;
CREATE POLICY lease_lessee_schedule_period_company_isolation ON accounting.lease_lessee_schedule_period
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.lease_lessee_schedule_period TO ih35_app;
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.lease_lessee_schedule_period;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.lease_lessee_schedule_period
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
COMMENT ON TABLE accounting.lease_lessee_schedule_period IS 'ROUND 321: ASC 842 lessee schedule per lease asset line and period (payment / interest / principal / liability / ROU); bill + accretion JE FKs.';

-- LEAD 443.331 (10-24): this block used to DROP + re-ADD the role CHECK with a static list copied on 10-01. Migrations
-- applied since (e.g. intercompany_receivable_ih35_transportation, fuel_card_payable_dreamline, related_party_loan_parent,
-- fuel_card_payable_wex) admitted roles that are in use on prod, so the static list failed:
-- "check constraint chart_of_accounts_roles_role_check ... is violated by some row" (prod fork 10-24). Same dynamic append
-- as 202616030100: read the live constraint, add only this migration's four lease roles, re-create.
DO $$
DECLARE def text; roles text[]; want text[] := ARRAY['rou_asset','lease_liability','accumulated_rou_amortization','lease_interest_expense'];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615210000: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> want) THEN
    roles := array(SELECT DISTINCT unnest(roles || want));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;
COMMIT;
