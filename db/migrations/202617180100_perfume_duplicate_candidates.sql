-- PERFUME duplicate detector engine — owner 2026-11-27 17:17 CT: "WE NEED TO BE ABLE TO HAVE AN AUTOMATICATE DUPLICATE DETECTOR ENGINE AND
-- RECOMENDATIONS AS YOU ARE WORKING IT SHOULD WORK AS WELL. AND WE JSUT CONFIRM".
-- The engine (perfume/duplicate-detector.service.ts) scans live contact companies (contacts, customers, vendors — one company record)
-- for pairs that are probably the same company: the same match key, a near-identical name (pg_trgm similarity), the same phone, the
-- same web domain, the same street address. Each pair is one recommendation with its reasons and a score; the owner confirms
-- (merge through company-merge.service.ts — the other company becomes a location) or dismisses ("not a duplicate" — never suggested
-- again). The engine runs after every contacts import / Excel update / merge and on demand. Never deleted.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS perfume.duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'company' CHECK (entity IN ('company')),
  a_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  b_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  reasons text[] NOT NULL,
  score numeric(5, 3) NOT NULL CHECK (score >= 0 AND score <= 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'dismissed', 'gone')),
  decided_by uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (a_id < b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfume_duplicate_candidates_pair ON perfume.duplicate_candidates (entity, a_id, b_id);
CREATE INDEX IF NOT EXISTS idx_perfume_duplicate_candidates_open ON perfume.duplicate_candidates (status, score DESC);
CREATE INDEX IF NOT EXISTS idx_perfume_contact_companies_name_key_trgm ON perfume.contact_companies USING gin (name_key gin_trgm_ops) WHERE archived_at IS NULL;
ALTER TABLE perfume.duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.duplicate_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS duplicate_candidates_owner_only ON perfume.duplicate_candidates;
CREATE POLICY duplicate_candidates_owner_only ON perfume.duplicate_candidates FOR ALL USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
GRANT SELECT, INSERT, UPDATE ON perfume.duplicate_candidates TO ih35_app;
COMMIT;
