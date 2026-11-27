-- PERFUME-LEAD-EVENTS (owner 2026-11-26 18:13 CT via the P1 seat's "fully wired" checklist, item g: "History: who/when for
-- every change"). One append-only history for the Lead lane: contacts (companies / people), catalog values, campaigns,
-- segments, trades and trade buyers. Every write the Leads, Catalogs, Excel update, Campaigns and Traders screens make
-- records one row: what (entity + id), which action, the changed fields (before → after) and who / when.
--
-- Append-only: SELECT and INSERT only, no UPDATE, no DELETE grant. Isolated perfume schema (ScentsX LLC), FORCE RLS
-- owner-only like every perfume table, references only perfume.* and identity.users. Additive, idempotent.

CREATE TABLE IF NOT EXISTS perfume.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('company', 'person', 'catalog_value', 'campaign', 'segment', 'trade', 'trade_buyer', 'contact_upload')),
  entity_id uuid NOT NULL,
  company_id uuid REFERENCES perfume.contact_companies(id),
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 60),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  upload_id uuid REFERENCES perfume.contact_uploads(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS lead_events_entity_idx ON perfume.lead_events (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_company_idx ON perfume.lead_events (company_id, created_at DESC) WHERE company_id IS NOT NULL;

ALTER TABLE perfume.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.lead_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_events_owner_only ON perfume.lead_events;
CREATE POLICY lead_events_owner_only ON perfume.lead_events USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.lead_events TO ih35_app;
