-- E1 / row 162 (LEAD, owner 11-03 13:31 CT "you are the lead, you can do anything necessary";
-- owner 11-02 "on data actions i follow your recomendation").
--
-- WHAT WAS WRONG (measured 11-03 on prod, USMCA): 262 of 281 Relay fills had no driver. The Relay matcher keys on
-- mdata.drivers.integration_id — ONE Relay id per driver — and 0 USMCA drivers carry one. Relay issues a driver more
-- than one id (Angel Alfonso Sosa Perez holds …1314 and …3916; Vicente Santos Contreras …2649 and …0417), so a
-- single column on the driver can never hold the real mapping.
--
-- THE FIX: integrations.relay_driver_links — many Relay integration ids → one driver, each link with its evidence and
-- who confirmed it. The matcher (relay-fuel-driver-match.ts) reads mdata.drivers.integration_id first, then this table,
-- and follows a merged driver to its survivor. Still integration_id ONLY (no name / phone / Relay driver.id key).
-- Void-not-delete: a wrong link is voided with a reason, never deleted.
--
-- SEED: the 17 links of the Lead recommendation (docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md §E1),
-- each to the unmerged Active/Probation survivor row. Keyed on the full Relay integration id read from the stored fills
-- (one id per 4-digit suffix, measured 11-03), and only where that driver row exists and is not merged/deactivated —
-- on a fresh database the seed inserts nothing. Idempotent (ON CONFLICT DO NOTHING on the live-link unique index).

CREATE TABLE IF NOT EXISTS integrations.relay_driver_links (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  relay_integration_id   text NOT NULL CHECK (btrim(relay_integration_id) <> '' AND relay_integration_id <> '0000000000000000'),
  driver_id              uuid NOT NULL REFERENCES mdata.drivers(id),
  relay_name             text NULL,
  evidence               text NOT NULL CHECK (btrim(evidence) <> ''),
  confirmed_by           text NOT NULL CHECK (btrim(confirmed_by) <> ''),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NULL REFERENCES identity.users(id),
  voided_at              timestamptz NULL,
  voided_by              uuid NULL REFERENCES identity.users(id),
  void_reason            text NULL,
  CONSTRAINT relay_driver_links_void_reason CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, '')) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS relay_driver_links_live_key
  ON integrations.relay_driver_links (operating_company_id, relay_integration_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS relay_driver_links_driver ON integrations.relay_driver_links (driver_id);

COMMENT ON TABLE integrations.relay_driver_links IS
  'E1: many Relay driver integration ids -> one mdata.drivers row (a driver can hold several Relay cards/ids). Read by relay-fuel-driver-match.ts after mdata.drivers.integration_id. Void-not-delete.';

ALTER TABLE integrations.relay_driver_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_driver_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_driver_links_entity_select ON integrations.relay_driver_links;
DROP POLICY IF EXISTS relay_driver_links_entity_write  ON integrations.relay_driver_links;
CREATE POLICY relay_driver_links_entity_select ON integrations.relay_driver_links FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY relay_driver_links_entity_write ON integrations.relay_driver_links FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- NO DELETE (void-not-delete). The schema default privileges may auto-grant DELETE on new relations; revoke it.
GRANT SELECT, INSERT, UPDATE ON integrations.relay_driver_links TO ih35_app;
REVOKE DELETE ON integrations.relay_driver_links FROM ih35_app;

-- Seed (USMCA). suffix → driver survivor row, Relay name, evidence (Relay name + the truck's load driver at fill time).
WITH m(suffix, driver_id, evidence) AS (VALUES
  ('2937', '45fac397-860e-4fe8-ae18-67e12e1959c1'::uuid, 'Relay name JOSE ANTONIO VICENTE; load driver at fill time 24/26'),
  ('7497', '3e138476-06db-4b08-9ebe-527a5d8c591d'::uuid, 'Relay name Jorge Corona; load driver at fill time 22/22'),
  ('1314', '52037e93-484a-4659-ab60-cf2a78f4c647'::uuid, 'Relay name ANGEL SOSA; load driver at fill time 28/29'),
  ('3916', '52037e93-484a-4659-ab60-cf2a78f4c647'::uuid, 'Relay name ANGEL ALFONSO SOSA; load driver at fill time 9/9'),
  ('0990', '4ff53886-41cc-434f-ae23-a36a0e3ec8e2'::uuid, 'Relay name LUIS SOSA; load driver at fill time 19/19'),
  ('5431', '93be328f-ba1b-4175-adaf-bb619c1c51f2'::uuid, 'Relay name FERNANDO MECOR; load driver at fill time 22/22'),
  ('7391', 'a32a35c8-7cd5-4368-83f0-35e185092433'::uuid, 'Relay name Neftali Urbano; load driver at fill time 23/23'),
  ('4404', '1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9'::uuid, 'Relay name PEDRO PEREZ; load driver at fill time 18/18'),
  ('0522', '61727a46-af2e-4d33-8236-e2d99b737708'::uuid, 'Relay name CARLOS MAURICIO; load driver at fill time 5/5'),
  ('2689', '6edcb351-e81b-4bf2-adf7-5eca9eff9137'::uuid, 'Relay name GENARO; load driver at fill time 18/18'),
  ('8768', 'c864a4bb-a7ff-4373-a5e1-c1590eefe3b7'::uuid, 'Relay name Rafael Reynoso (truck shared with Luis Sosa: load driver 4/7)'),
  ('3301', '5dd518ff-db91-429f-b651-a71b5f0db672'::uuid, 'Relay name Leonel Morales; load driver at fill time 9/9'),
  ('8345', 'e3ac0879-8558-4c01-922f-0cc2d94b937b'::uuid, 'Relay name EDUARDO AZAEL; load driver at fill time 12/12'),
  ('5121', '3445cf68-4a7f-4d73-89f7-04bf1fd207b4'::uuid, 'Relay name HUGO GAYTAN; load driver at fill time 11/12'),
  ('2649', '40022039-b657-4713-97de-439fba899946'::uuid, 'Relay name Vicente Contreras; load driver at fill time 2/5'),
  ('0417', '40022039-b657-4713-97de-439fba899946'::uuid, 'Relay name VICENTE SANTOS'),
  ('1861', 'a785bea7-6dde-4bf9-81b9-b9135c2df4b5'::uuid, 'Relay name PEDRO LOPEZ; load driver at fill time 2/2')
), ids AS (
  SELECT DISTINCT ON (r.relay_driver_integration_id)
         r.operating_company_id, r.relay_driver_integration_id AS iid,
         btrim(regexp_replace(coalesce(r.relay_driver_first_name, '') || ' ' || coalesce(r.relay_driver_last_name, ''), '\s+', ' ', 'g')) AS relay_name,
         m.driver_id, m.evidence
    FROM integrations.relay_fuel_transactions r
    JOIN m ON right(r.relay_driver_integration_id, 4) = m.suffix
   WHERE r.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
     AND r.relay_driver_integration_id IS NOT NULL
   ORDER BY r.relay_driver_integration_id, r.relay_created_at DESC NULLS LAST
)
INSERT INTO integrations.relay_driver_links (operating_company_id, relay_integration_id, driver_id, relay_name, evidence, confirmed_by)
SELECT ids.operating_company_id, ids.iid, ids.driver_id, NULLIF(ids.relay_name, ''), ids.evidence,
       'Lead recommendation 11-03-2026 (owner 11-02: "on data actions i follow your recomendation")'
  FROM ids
  JOIN mdata.drivers d ON d.id = ids.driver_id
 WHERE d.merged_into_driver_id IS NULL AND d.deactivated_at IS NULL AND d.archived_at IS NULL
ON CONFLICT (operating_company_id, relay_integration_id) WHERE voided_at IS NULL DO NOTHING;
