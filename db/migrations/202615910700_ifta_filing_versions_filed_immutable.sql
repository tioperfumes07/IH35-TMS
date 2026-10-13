-- 202615910700_ifta_filing_versions_filed_immutable.sql
-- CC-2 · LEAD 443.134 AJK-13 (Codex audit, moved from Codex): preparing IFTA for a quarter UPSERTed on (company, quarter) and
-- reset an owner-approved or FILED return to draft — wiping approved_by / approved_at / filed_at / confirmation_number of a
-- return already sent to the state. A filed / approved filing is never modified; a re-prepare is a NEW draft version.
--
--   reports.ifta_filings.version (1, 2, ...) + supersedes_filing_uuid (the version it amends).
--   Unique key: old (operating_company_id, quarter); new (operating_company_id, quarter, version). Why: an amendment is a
--   second row for the same quarter. At most ONE open (draft / review) version per quarter (partial unique index).
--   trg_ifta_filing_immutable_once_approved: a 'filed' row is never updated; an 'owner_approved' row may only become 'filed'
--   (filed_at / confirmation_number), nothing else changes.
-- Measured prod 2026-10-12: 1 USMCA filing (draft) — it keeps version 1. Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

ALTER TABLE reports.ifta_filings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE reports.ifta_filings ADD COLUMN IF NOT EXISTS supersedes_filing_uuid uuid REFERENCES reports.ifta_filings(uuid);

ALTER TABLE reports.ifta_filings DROP CONSTRAINT IF EXISTS ifta_filings_operating_company_id_quarter_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ifta_filings_company_quarter_version_key') THEN
    ALTER TABLE reports.ifta_filings
      ADD CONSTRAINT ifta_filings_company_quarter_version_key UNIQUE (operating_company_id, quarter, version);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ifta_filings_version_positive') THEN
    ALTER TABLE reports.ifta_filings ADD CONSTRAINT ifta_filings_version_positive CHECK (version >= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ifta_filings_one_open_version
  ON reports.ifta_filings (operating_company_id, quarter) WHERE status IN ('draft', 'review');

CREATE OR REPLACE FUNCTION reports.refuse_ifta_filing_change_once_approved()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.status = 'filed' THEN
    RAISE EXCEPTION 'ifta_filing_immutable: filing % (quarter %, version %) is filed — re-prepare creates a new draft version',
      OLD.uuid, OLD.quarter, OLD.version USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'owner_approved' AND (
       NEW.status <> 'filed'
    OR NEW.filing_data IS DISTINCT FROM OLD.filing_data
    OR NEW.quarter IS DISTINCT FROM OLD.quarter
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.prepared_by_user_uuid IS DISTINCT FROM OLD.prepared_by_user_uuid
    OR NEW.approved_by_user_uuid IS DISTINCT FROM OLD.approved_by_user_uuid
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'ifta_filing_immutable: filing % (quarter %, version %) is owner-approved — it can only be marked filed; re-prepare creates a new draft version',
      OLD.uuid, OLD.quarter, OLD.version USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ifta_filing_immutable_once_approved ON reports.ifta_filings;
CREATE TRIGGER trg_ifta_filing_immutable_once_approved BEFORE UPDATE ON reports.ifta_filings
  FOR EACH ROW EXECUTE FUNCTION reports.refuse_ifta_filing_change_once_approved();

COMMENT ON COLUMN reports.ifta_filings.version IS 'LEAD 443.134 AJK-13: 1 = original; a re-prepare of an approved / filed quarter is version + 1.';
COMMENT ON COLUMN reports.ifta_filings.supersedes_filing_uuid IS 'LEAD 443.134 AJK-13: the approved / filed version this draft amends.';

COMMIT;
