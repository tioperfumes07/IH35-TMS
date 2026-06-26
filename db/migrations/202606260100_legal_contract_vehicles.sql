-- [HOLD-FOR-JORGE — gated] LEGAL-CONTRACT-CREATOR-01 — Exhibit A per-truck child table.
--
-- ARCHITECTURE (Option A, Jorge-confirmed): the lease-to-own creator REUSES the existing legal contract
-- system from migration 0126_p8a_pr1_legal_schema_templates — it does NOT create a parallel
-- legal.contracts / legal.contract_template (that would duplicate legal.contract_instances /
-- legal.contract_templates and cause dual-write drift). Mapping:
--   - canonical article text  -> legal.contract_templates  (seed a template_code='lease_to_own', content_html_en)
--   - the saved contract      -> legal.contract_instances  (status draft/sent/signed/voided; filled_variables
--                                jsonb holds ALL deal-level fields: lessee block, term_months, use_charge_pct,
--                                seller_entity_name, governing_law, venue_county, execution_date, reference_no)
--   - Exhibit A per-truck rows -> legal.contract_vehicles   <-- the ONLY thing with no home today (this migration)
--
-- Seller is always IH 35 Trucking, LLC (TRK, org.companies.code='TRK'); deal-level seller fields are
-- auto-filled from org.companies and stored in contract_instances.filled_variables (no column here).
-- This module records contract terms ONLY — it NEVER writes accounting.* (no GL posting; a static CI
-- guard enforces that). Additive, entity-scoped, RLS forced; matches the 0126 legal.* pattern
-- (RLS keys on app.operating_company_id; schema-level GRANTs + DEFAULT PRIVILEGES from 0126 also cover
-- new tables, but this migration is self-contained per Standing Order #16 v2). Replays clean from 0001
-- (legal schema + contract_instances created in 0126, which precedes this).

CREATE TABLE IF NOT EXISTS legal.contract_vehicles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  contract_instance_id  uuid NOT NULL REFERENCES legal.contract_instances(id) ON DELETE CASCADE,
  unit_id               uuid REFERENCES mdata.units(id),         -- live fleet link (nullable: manual row allowed)
  -- snapshot of fleet facts at draft time (so a later fleet edit doesn't silently change an executed contract)
  unit_number           text,
  year                  integer,
  make                  text,
  model                 text,
  vin                   text,
  -- per-truck lease terms (Exhibit A). money as numeric — NO GL posting from this module.
  lienholder            text DEFAULT 'None',
  balance_owed          numeric(14,2),
  monthly_lease_amount  numeric(14,2),
  payment_due_date      text,
  sort_order            integer NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,           -- §2 void-not-delete: row-remove = is_active=false
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_contract_vehicles_contract
  ON legal.contract_vehicles (operating_company_id, contract_instance_id, sort_order);

ALTER TABLE legal.contract_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.contract_vehicles FORCE ROW LEVEL SECURITY;

-- entity-scope policy — same GUC as the rest of legal.* (app.operating_company_id), idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'legal' AND tablename = 'contract_vehicles'
       AND policyname = 'legal_contract_vehicles_scope'
  ) THEN
    CREATE POLICY legal_contract_vehicles_scope ON legal.contract_vehicles
      USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)
      WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
  END IF;
END $$;

-- self-contained grants (0126 schema-level DEFAULT PRIVILEGES also cover this; explicit per drift-capture).
GRANT SELECT, INSERT, UPDATE, DELETE ON legal.contract_vehicles TO ih35_app;
