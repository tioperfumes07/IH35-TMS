-- [HOLD-FOR-JORGE — TIER 1] AF-4 — A/P bills migration (QBO open bills → accounting.bills): SCAFFOLD ONLY.
-- DO NOT RUN ON PROD until Jorge says "OK to merge" (financial cluster: accounting.* new tables + flag).
-- Runs only on a Neon branch first; ledger-backfilled at merge. Money movement stays OFF — see design doc
-- docs/accounting/AF-4-AF-2-AF-7-DESIGN.md.
--
-- WHY: docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/AF-4-ap-bills-migration.txt — QBO's current open A/P
-- (live figure pulled 2026-07-06: $1,333,175.94 / 151 vendors — see docs/OPENING-BALANCES-TRANSP-2024-12-31.md
-- "CURRENT A/P" section; NEVER hardcode, the importer re-pulls live at cutover) is not yet in TMS
-- accounting.bills. SEQUENCING GATE (per the block doc): AF-2 (drift) lands first so vendors/COA are
-- reconciled before bills migrate onto them.
--
-- THIS MIGRATION ADDS SCHEMA ONLY — an audited PREVIEW/staging layer, not the money-moving write:
--   1. AP_IMPORT_ENABLED (per-entity-only flag, default OFF) — gates the (not-yet-built) execute step.
--      Building the actual accounting.bills INSERT/write path is explicitly OUT OF SCOPE for this PR per
--      the standing "never build finance/posting logic solo" rule — see design doc §4 for the full
--      write-path spec Jorge reviews before a follow-up PR implements it.
--   2. accounting.ap_import_batches — one row per QBO A/P pull the owner runs through the (future)
--      importer; append-only audit trail of every review cycle (who ran it, when, against what QBO
--      as-of, totals, and its approve/reject disposition). void-not-delete (voided_at only).
--   3. accounting.ap_import_preview_lines — one row per QBO open bill seen in that pull: the reviewable
--      bill list Jorge reviews before any import (vendor match status, amounts, aging bucket, blocking
--      reasons). Append-only (a re-pull creates a NEW batch; it never edits a prior batch's lines).
-- Idempotent (CREATE IF NOT EXISTS / ON CONFLICT). FORCED RLS, entity-scoped, self-contained grants.
-- No posting/GL math (bills, once actually inserted by the future write-path PR, reuse the existing
-- accounting.bills row shape/columns already established by migration 0090 — no new money math here).

BEGIN;

-- ── 1. Flag: gates the future execute/import step. Default OFF; per-entity-only (never global). ──────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'AP_IMPORT_ENABLED',
  'AF-4: allow the QBO A/P importer to WRITE approved preview batches into accounting.bills / '
  || 'mdata.vendors. DEFAULT OFF. The write path is not yet built (design-only in this PR) — this flag '
  || 'exists now so the schema/preview layer ships gated from day one. Per-entity owner-gated only '
  || '(TRANSP first; never a global enable — USMCA/TRK must opt in separately, if ever).',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- ── 2. ap_import_batches — one row per QBO A/P pull ("financial ceremony" audit trail). ───────────────
CREATE TABLE IF NOT EXISTS accounting.ap_import_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  requested_by_user_id  uuid REFERENCES identity.users(id),
  requested_at          timestamptz NOT NULL DEFAULT now(),
  qbo_as_of             timestamptz NOT NULL,           -- when the QBO A/P snapshot was actually pulled
  total_vendors         integer NOT NULL DEFAULT 0,
  total_bills           integer NOT NULL DEFAULT 0,
  total_amount_cents    bigint NOT NULL DEFAULT 0,
  blocked_bills         integer NOT NULL DEFAULT 0,     -- lines with an unresolved blocking_reason
  status                text NOT NULL DEFAULT 'previewed'
                          CHECK (status IN ('previewed', 'approved', 'executed', 'rejected')),
  reviewed_by_user_id   uuid REFERENCES identity.users(id),
  reviewed_at           timestamptz,
  review_notes          text,
  voided_at             timestamptz,                    -- void-not-delete
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ap_import_batches_company_idx
  ON accounting.ap_import_batches (operating_company_id, requested_at DESC)
  WHERE is_active;

-- ── 3. ap_import_preview_lines — the reviewable bill list, one row per QBO open bill in the pull. ─────
CREATE TABLE IF NOT EXISTS accounting.ap_import_preview_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              uuid NOT NULL REFERENCES accounting.ap_import_batches(id),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),  -- denormalized for direct RLS scoping
  qbo_vendor_id          text NOT NULL,
  qbo_bill_id            text NOT NULL,
  vendor_name_qbo        text NOT NULL,
  bill_number            text,
  bill_date              date,
  due_date               date,
  amount_cents           bigint NOT NULL,
  aging_bucket           text CHECK (aging_bucket IN ('current', '1-30', '31-60', '61-90', '91+')),
  vendor_match_status    text NOT NULL DEFAULT 'unmatched'
                          CHECK (vendor_match_status IN ('matched', 'unmatched', 'ambiguous')),
  matched_vendor_id      uuid REFERENCES mdata.vendors(id),
  blocking_reason        text,                          -- non-null = this line cannot import yet (e.g.
                                                          -- "vendor not reconciled — AF-2 gate",
                                                          -- "duplicate qbo_bill_id in batch")
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, qbo_bill_id)
);

CREATE INDEX IF NOT EXISTS ap_import_preview_lines_batch_idx
  ON accounting.ap_import_preview_lines (batch_id);
CREATE INDEX IF NOT EXISTS ap_import_preview_lines_company_idx
  ON accounting.ap_import_preview_lines (operating_company_id);

-- ── Entity-scoped FORCED RLS (canonical predicate) ─────────────────────────────────────────────────────
ALTER TABLE accounting.ap_import_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ap_import_batches        FORCE  ROW LEVEL SECURITY;
ALTER TABLE accounting.ap_import_preview_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ap_import_preview_lines  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_import_batches_entity_all ON accounting.ap_import_batches;
CREATE POLICY ap_import_batches_entity_all ON accounting.ap_import_batches FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS ap_import_preview_lines_entity_all ON accounting.ap_import_preview_lines;
CREATE POLICY ap_import_preview_lines_entity_all ON accounting.ap_import_preview_lines FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── Grants: batches get SELECT/INSERT/UPDATE (status transitions); preview lines are append-only ──────
--    (a re-pull is a NEW batch — no line is ever edited once written) so REVOKE UPDATE/DELETE there.
--    accounting.* default privileges may auto-grant DELETE/UPDATE — REVOKE explicitly (verify via
--    information_schema.role_table_grants, not by reading this file).
GRANT  USAGE ON SCHEMA accounting TO ih35_app;
GRANT  SELECT, INSERT, UPDATE ON accounting.ap_import_batches TO ih35_app;
REVOKE DELETE ON accounting.ap_import_batches FROM ih35_app;
GRANT  SELECT, INSERT ON accounting.ap_import_preview_lines TO ih35_app;
REVOKE UPDATE, DELETE ON accounting.ap_import_preview_lines FROM ih35_app;

COMMIT;
