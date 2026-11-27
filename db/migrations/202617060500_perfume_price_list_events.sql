-- PERFUME-LIST-RESTORE (owner 2026-11-27 08:51 CT): "A. Do whatever necessary get it done now. Add void buttons etc restore buttons".
--
-- A vendor list can be voided and now restored from the Lists tab. Every void and every restore is one row here, written once and
-- never changed: which list, voided or restored, the reason given, who, when. perfume.price_lists keeps only the latest state
-- (voided_at / void_reason); this table keeps the whole history so a restore never erases why the list was voided.
-- Isolated perfume schema (ScentsX LLC), owner-only (FORCE RLS (SELECT perfume.is_owner()), the once-per-query form), SELECT / INSERT only. Never accounting.

BEGIN;

CREATE TABLE IF NOT EXISTS perfume.price_list_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES perfume.price_lists(id),
  kind text NOT NULL CHECK (kind IN ('voided', 'restored')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS price_list_events_list_idx ON perfume.price_list_events (list_id, created_at);

ALTER TABLE perfume.price_list_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.price_list_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_list_events_owner_only ON perfume.price_list_events;
CREATE POLICY price_list_events_owner_only ON perfume.price_list_events USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
GRANT SELECT, INSERT ON perfume.price_list_events TO ih35_app;

COMMIT;
