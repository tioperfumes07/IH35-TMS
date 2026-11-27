-- PERFUME-ITEM-FILE (owner 2026-11-26 22:51 CT): "IN ITEMS, I ALREADY PROVIDED YOU WITH UPCS AND TIO PERFUMES INTERNAL CODES AS
-- WELL AS HK INTERNAL CODES, WE NEED THE ITEM FILE FOR EACH ITEM ETC SO WE CAN EDIT, ETC AND THE LINKAGE SCREEN THAT SHOWS THE
-- ITEM UPC AND LINKED TO AND DESCRIPTIONS TO ALL LINKED".
--
-- Every change made on an item's file — its name / brand / size / type / gender, its TIO code, a UPC added or moved to it, an HK
-- code added or moved to it, a vendor line linked to it — is one row here, written once and never changed: who, when, from what to
-- what. Isolated perfume schema (ScentsX LLC), owner-only (FORCE RLS perfume.is_owner()), SELECT / INSERT only. Never accounting.

BEGIN;

CREATE TABLE IF NOT EXISTS perfume.item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  kind text NOT NULL CHECK (kind IN ('edited', 'tio_code', 'upc_added', 'upc_moved_in', 'upc_moved_out', 'hk_code_added', 'hk_code_moved_in',
                                     'hk_code_moved_out', 'line_linked', 'codes_filled')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS item_events_item_idx ON perfume.item_events (item_id, created_at);

ALTER TABLE perfume.item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_events_owner_only ON perfume.item_events;
CREATE POLICY item_events_owner_only ON perfume.item_events USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.item_events TO ih35_app;

COMMIT;
