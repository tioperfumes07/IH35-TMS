-- SRCH-F6231: the same canonical driver may be visible in multiple operating companies through
-- driver_company_authorizations. Universal-search identity must therefore include company scope;
-- the old global (entity_type, entity_uuid) key made indexing one company evict the other.
BEGIN;

ALTER TABLE search.universal_index
  DROP CONSTRAINT IF EXISTS universal_index_entity_type_entity_uuid_key;

ALTER TABLE search.universal_index
  DROP CONSTRAINT IF EXISTS universal_index_company_entity_key;

ALTER TABLE search.universal_index
  ADD CONSTRAINT universal_index_company_entity_key
  UNIQUE (operating_company_id, entity_type, entity_uuid);

COMMIT;
