-- GAP-89: Universal Cmd-K quick switcher search index
BEGIN;

CREATE SCHEMA IF NOT EXISTS search;

CREATE TABLE IF NOT EXISTS search.universal_index (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_uuid UUID NOT NULL,
  display_text TEXT NOT NULL,
  search_text TSVECTOR NOT NULL,
  secondary_text TEXT,
  url_path TEXT NOT NULL,
  icon TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_uuid)
);

CREATE INDEX IF NOT EXISTS idx_search_tsvector ON search.universal_index USING GIN (search_text);
CREATE INDEX IF NOT EXISTS idx_search_entity ON search.universal_index (entity_type);
CREATE INDEX IF NOT EXISTS idx_search_company ON search.universal_index (operating_company_id);

ALTER TABLE search.universal_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_universal_index_tenant ON search.universal_index;
CREATE POLICY search_universal_index_tenant ON search.universal_index
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON search.universal_index TO ih35_app;

COMMIT;
