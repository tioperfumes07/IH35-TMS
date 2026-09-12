-- ROUND 20.1 (Claude Lead, 2026-09-12 21:41Z) MEASURED DEFECT A: 9 loads on 6 units are orphaned
-- from their unit/driver's currently-open pre-settlement tour despite having driver+trip_type and
-- reaching dispatch — mdata.loads.presettlement_link_id IS NULL. Root cause (fixed in the same PR,
-- apps/backend/src/dispatch/update-load.service.ts): a load booked with a driver seated but
-- trip_type not yet known gets a deferred-suggestion row at booking, and Edit Load never re-checked
-- presettlement linking once trip_type (or the driver) was filled in later — the only write path
-- that never re-entered the linker on an edit, unlike quick-assign/planner/dispatch-refinements/
-- quicksave, which all already do.
--
-- This is a hand-verified, explicit load_number -> target open-settlement pairing (NOT a generic
-- same-unit pattern sweep): a live investigation while building this migration found unit T170's
-- own historical tour_id 61f298ed (settlement S-2026-0013, source_document_ref=5779, CANCELLED,
-- trip_closed_at NULL) spans THREE additional loads (13527/13561/13567) also carrying
-- presettlement_link_id IS NULL, from separate, real trip cycles between 2026-09-05 and
-- 2026-09-11 that the Lead's ROUND 20.1 measurement did not name and are explicitly OUT OF SCOPE
-- for this backfill (they are a related but separate historical-attribution question, not this
-- item's "9 orphan legs" — flagged in the guard/PR, not silently swept in and not silently
-- ignored). A generic "same unit+driver, presettlement_link_id IS NULL" sweep would have
-- incorrectly touched those three; explicit pairing does not.
--
-- Idempotent: every UPDATE is guarded on presettlement_link_id IS NULL, so a second run is a no-op.
-- USMCA only. Void-never-delete: no rows removed, only a NULL FK backfilled to its real target.
-- is_sample_data untouched. No new GL math — driver_finance.driver_settlements rows are read-only
-- here; only mdata.loads.presettlement_link_id is written.
BEGIN;

WITH orphan_targets(load_number, settlement_id, unit_number, driver_check) AS (
  VALUES
    ('13563', '4db66351-c523-43a4-b949-bd4d9c42e5a2'::uuid, 'T148', 'c864a4bb-a7ff-4373-a5e1-c1590eefe3b7'::uuid),
    ('13553', '4db66351-c523-43a4-b949-bd4d9c42e5a2'::uuid, 'T148', 'c864a4bb-a7ff-4373-a5e1-c1590eefe3b7'::uuid),
    ('13578', 'f074c0c9-266c-4fc6-9c1e-446d702ced49'::uuid, 'T156', 'fba21d80-628b-4228-ae54-336f9cbb73b6'::uuid),
    ('13579', 'f074c0c9-266c-4fc6-9c1e-446d702ced49'::uuid, 'T156', 'fba21d80-628b-4228-ae54-336f9cbb73b6'::uuid),
    ('13569', '6a8ecf55-c321-4648-bb05-17fada8881a4'::uuid, 'T168', '93be328f-ba1b-4175-adaf-bb619c1c51f2'::uuid),
    ('13577', '6a8ecf55-c321-4648-bb05-17fada8881a4'::uuid, 'T168', '93be328f-ba1b-4175-adaf-bb619c1c51f2'::uuid),
    ('13588', '89c90396-28b3-46cd-8920-2c496e499b2f'::uuid, 'T170', '4ff53886-41cc-434f-ae23-a36a0e3ec8e2'::uuid),
    ('13576', '63a8333b-8446-4426-bd34-4277997608ec'::uuid, 'T171', '45fac397-860e-4fe8-ae18-67e12e1959c1'::uuid),
    ('13582', 'f5305500-726f-4650-ab1c-ebef26db4c31'::uuid, 'T177', '3e138476-06db-4b08-9ebe-527a5d8c591d'::uuid)
)
UPDATE mdata.loads l
   SET presettlement_link_id = t.settlement_id,
       updated_at = now()
  FROM orphan_targets t
 WHERE l.load_number = t.load_number
   AND l.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
   AND l.assigned_primary_driver_id = t.driver_check
   AND l.presettlement_link_id IS NULL
   AND EXISTS (
     SELECT 1 FROM driver_finance.driver_settlements ds
      WHERE ds.id = t.settlement_id
        AND ds.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
        AND ds.status = 'open'
   );

COMMIT;
