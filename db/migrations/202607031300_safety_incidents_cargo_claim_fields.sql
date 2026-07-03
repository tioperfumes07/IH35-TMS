-- SC4 — Cargo Claims: Carmack/49 CFR 1005.2 claim-intake fields on safety.incidents.
-- Additive, nullable, idempotent. Cargo_claim rows only (enforced in backend, not by
-- a table CHECK, so damage_report/trailer_interchange rows stay untouched).
--
-- Federal minimum-content standard (49 CFR 1005.2(b)) requires a cargo claim to (1) identify
-- the shipment, (2) assert carrier liability, (3) claim a specified/determinable amount. The
-- table already stores shipment (load_id) and amount (damage_amount_cents) but had NO field
-- for the claimant, the reason, or the filed date (Carmack 9-month filing deadline is enforced
-- against the filed date). These three additive columns close that gap.

BEGIN;

ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS claim_reason_code text NULL,
  ADD COLUMN IF NOT EXISTS claimant_customer_id uuid NULL
    REFERENCES mdata.customers(id),
  ADD COLUMN IF NOT EXISTS claim_filed_at date NULL;

COMMENT ON COLUMN safety.incidents.claim_reason_code IS
  'Cargo claim reason code from catalogs cargo-claim-reasons (cargo_claim rows only)';
COMMENT ON COLUMN safety.incidents.claimant_customer_id IS
  'Claimant (customer) for cargo_claim rows — 49 CFR 1005.2 claimant identification';
COMMENT ON COLUMN safety.incidents.claim_filed_at IS
  'Date the claimant filed the claim — Carmack filing-deadline tracking';

-- GRANTS: table-level privileges (SELECT/INSERT/UPDATE granted to ih35_app in 0345_safety_incidents.sql)
-- automatically cover newly added columns — Postgres column privileges are inherited from the
-- table grant unless a column-scoped grant is present, and none is. Re-affirm idempotently so a
-- fresh-DB apply is self-contained and drift-proof.
GRANT SELECT, INSERT, UPDATE ON safety.incidents TO ih35_app;

-- RLS: safety_incidents_tenant_scope (0345) is FOR ALL and keys on the row's own
-- operating_company_id (identity.is_lucia_bypass() OR operating_company_id = app.operating_company_id).
-- Row policies are column-agnostic — the new columns inherit that policy with no change. The FK to
-- mdata.customers does NOT grant cross-entity read; same-entity claimant is enforced in the backend
-- (400 claimant_company_mismatch), never relied on via the FK for tenant isolation.

-- Drift-capture: confirm the three columns are present post-apply (no-op assertion, aids CI/forensics).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'safety' AND table_name = 'incidents'
      AND column_name IN ('claim_reason_code', 'claimant_customer_id', 'claim_filed_at')
    GROUP BY table_name
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'SC4 drift: expected 3 cargo-claim columns on safety.incidents';
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback):
-- ALTER TABLE safety.incidents
--   DROP COLUMN IF EXISTS claim_reason_code,
--   DROP COLUMN IF EXISTS claimant_customer_id,
--   DROP COLUMN IF EXISTS claim_filed_at;
