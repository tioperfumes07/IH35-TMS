-- B19-V2 — audit chain verification record table (spec §5). Records each tamper-verification run of the
-- events.event_log hash chain. Append-only (SELECT+INSERT grants only — a verification record is itself
-- evidence and is never modified), entity-scoped FORCED RLS. Money-free; CREATE-only; idempotent.
-- The ops schema already exists (0192).

CREATE TABLE IF NOT EXISTS ops.audit_chain_verifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  run_at                timestamptz NOT NULL DEFAULT now(),
  events_checked        bigint NOT NULL DEFAULT 0,
  hash_breaks           bigint NOT NULL DEFAULT 0,   -- rows whose own hash recompute failed (content tamper)
  link_breaks           bigint NOT NULL DEFAULT 0,   -- post-anchor rows whose prev_hash != prior hash
  chain_ok              boolean NOT NULL DEFAULT true,
  first_break_seq       bigint,                      -- chain_seq of the earliest break (NULL if none)
  verifier_version      text
);

GRANT USAGE ON SCHEMA ops TO ih35_app;
GRANT SELECT, INSERT ON ops.audit_chain_verifications TO ih35_app;   -- no UPDATE/DELETE: append-only evidence

CREATE INDEX IF NOT EXISTS idx_audit_chain_verifications_opco_run
  ON ops.audit_chain_verifications (operating_company_id, run_at DESC);

ALTER TABLE ops.audit_chain_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_chain_verifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_chain_verifications_entity_select ON ops.audit_chain_verifications;
DROP POLICY IF EXISTS audit_chain_verifications_entity_insert ON ops.audit_chain_verifications;
CREATE POLICY audit_chain_verifications_entity_select ON ops.audit_chain_verifications FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY audit_chain_verifications_entity_insert ON ops.audit_chain_verifications FOR INSERT
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
