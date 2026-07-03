-- RATECON-1 — rate-confirmation AI extraction audit table + feature flag. Owner-approved 2026-07-02.
-- BUILD-AND-HOLD (this is a migration → never self-merge; GUARD/Jorge merges on green per the block).
-- Authored from the ih35-financial-migrations skill template: idempotent CREATE-only, entity-scoped
-- FORCED RLS, self-contained grants (0065 pattern), APPEND-ONLY (SELECT+INSERT — the extraction record is
-- the audit trail of exactly what the AI read, preserved and diffable against what the dispatcher accepted;
-- never mutated). Money-free: prefill only, no GL, no posting. The `dispatch` schema exists + is in the 0065
-- grant array; the `rate_confirmation` file category is REUSED (already seeded in 0028) — no catalogs touch.

BEGIN;

-- ── Feature flag (DEFAULT OFF — owner flips per entity when ready to test with a real rate con) ──────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'RATECON_EXTRACT_ENABLED',
  'RATECON-1: enable AI extraction of an uploaded rate confirmation to prefill the Book Load wizard '
  || '(editable draft, human-in-the-loop, NEVER auto-books). Endpoint returns 409 policy error when OFF. '
  || 'DEFAULT OFF — per-entity owner-gated.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- ── Extraction audit record — keyed to the uploaded docs.files row ──────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch.ratecon_extractions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  file_id               uuid NOT NULL REFERENCES docs.files(id),   -- the uploaded rate con (sha256 lives there)
  model_id              text NOT NULL,                             -- Anthropic model that produced the extraction
  status                text NOT NULL DEFAULT 'extracted'
                          CHECK (status IN ('extracted', 'error')),
  page_count            integer,                                   -- size-cap audit
  byte_size             bigint,
  extracted_total_cents bigint,                                    -- convenience mirror of raw_extraction.rate.total_cents
  total_matches_components boolean,                                -- server-side check: total == sum(components)?
  raw_extraction        jsonb NOT NULL,                            -- EXACTLY what the AI read (audit trail)
  error_detail          text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid
);

CREATE INDEX IF NOT EXISTS ratecon_extractions_opco_file_idx
  ON dispatch.ratecon_extractions (operating_company_id, file_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS ratecon_extractions_opco_created_idx
  ON dispatch.ratecon_extractions (operating_company_id, created_at DESC);

-- ── Entity-scoped FORCED RLS (canonical predicate) ─────────────────────────────────────────────────
ALTER TABLE dispatch.ratecon_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.ratecon_extractions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ratecon_extractions_entity_select ON dispatch.ratecon_extractions;
DROP POLICY IF EXISTS ratecon_extractions_entity_insert ON dispatch.ratecon_extractions;
CREATE POLICY ratecon_extractions_entity_select ON dispatch.ratecon_extractions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY ratecon_extractions_entity_insert ON dispatch.ratecon_extractions FOR INSERT
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── Grants: APPEND-ONLY (no UPDATE/DELETE — the record is immutable audit evidence of what the AI read).
--    NOTE: the `dispatch` schema has ALTER DEFAULT PRIVILEGES (0065) that auto-grant UPDATE+DELETE to
--    ih35_app on every new table, so a narrow GRANT alone is NOT enough — we must explicitly REVOKE them.
--    (The `ops` schema has no such default grant, which is why an ops audit table stays append-only without
--    a REVOKE.) The REVOKE trips the hold-merge-gate → PROTECTED, which is correct: this is a HOLD migration. ─
GRANT  SELECT, INSERT ON dispatch.ratecon_extractions TO ih35_app;
REVOKE UPDATE, DELETE ON dispatch.ratecon_extractions FROM ih35_app;

COMMIT;
