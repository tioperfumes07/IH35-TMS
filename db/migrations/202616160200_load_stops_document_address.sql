-- 202616160200_load_stops_document_address.sql  (CC-3, claimed on main first — LEAD 443.248)
-- OWNER / LEAD 443.248: "the signed settlement address is the stop's address of record; keep the GPS point / fence as the geo.
-- Show both on the stop." 13536 / 13573 / 13660 print a facility / city / ZIP on the signed AlwaysTrack settlement that differs
-- from the street / GPS-verified point the load carries (13660's pickup was GPS-corrected to where the truck actually stopped).
-- mdata.load_stops.document_address holds the printed address of record (company, city, state, ZIP, settlement number) beside
-- the stop's own address + coordinates, which stay the geo every fence / mileage / stop-evidence engine reads.
-- Written ONLY by the settlement-document engine (dispatch/settlement-document-load-facts.service.ts). ADDITIVE + IDEMPOTENT.
BEGIN;
SET LOCAL lock_timeout = '60s';
ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS document_address jsonb NULL;
COMMENT ON COLUMN mdata.load_stops.document_address IS
  'LEAD 443.248: the signed settlement''s printed address of record {settlement_no, company, city, state, zip}; the stop''s own address / coordinates stay the geo.';
COMMIT;
