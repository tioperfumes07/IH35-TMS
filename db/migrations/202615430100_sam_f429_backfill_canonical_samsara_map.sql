-- SAM-F429 — ONE MAP. Backfill every Samsara user the legacy column already named.
--
-- THE DEFECT. Two tables answered "which driver is this Samsara user":
--   integrations.samsara_drivers.local_driver_id  — written by the Mapping page, read by the Mapping page
--   mdata.driver_samsara_accounts                 — CANONICAL since ROUND 181.1, read by sync, HOS,
--                                                   messaging and the driver profile
-- #25515 made map/unmap write BOTH going forward, and repointed the mirror collector. It did not
-- move the rows that had already drifted. So a driver mapped before 2026-10-05 reads "mapped" on the
-- Mapping page and "0 Samsara users" on his own profile — at the same moment, about the same person.
-- The owner hit exactly that on ANGEL ALFONSO SOSA. Every engine follows the canonical map, so the
-- legacy answer is not merely stale, it is the one nothing else obeys.
--
-- WHAT THIS DOES. For every live Samsara user whose legacy column already names a driver and which
-- has no active canonical row, it writes the canonical row. It adds no information that was not
-- already recorded by a human on the Mapping page, and it is the same write that page performs today.
--
-- WHAT THIS REFUSES TO DO.
--   • It never invents a mapping. A null local_driver_id stays unmapped — a guess here would put a
--     driver's hours, messages and settlements under the wrong man.
--   • It never deletes, deactivates or overwrites a canonical row that already exists. Where the two
--     maps disagree about WHICH driver, the canonical row WINS and the row is reported, not rewritten.
--   • It writes nothing to Samsara. Nothing in this file reaches their API.
--   • It is idempotent: ON CONFLICT DO NOTHING, safe to run again, no second effect.

BEGIN;

-- The rows that are about to change, recorded before they change.
CREATE TEMP TABLE sam_f429_claimed ON COMMIT DROP AS
SELECT sd.operating_company_id,
       sd.samsara_driver_id,
       sd.local_driver_id AS driver_id
  FROM integrations.samsara_drivers sd
 WHERE sd.local_driver_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM mdata.driver_samsara_accounts a
      WHERE a.operating_company_id = sd.operating_company_id
        AND a.samsara_driver_id    = sd.samsara_driver_id
        AND a.is_active
   );

INSERT INTO mdata.driver_samsara_accounts
  (operating_company_id, driver_id, samsara_driver_id, samsara_username, first_seen_at, is_active, created_at, updated_at)
SELECT c.operating_company_id,
       c.driver_id,
       c.samsara_driver_id,
       NULLIF(sd.raw_payload->>'username', ''),
       COALESCE(sd.last_seen_at, now()),
       true,
       now(),
       now()
  FROM sam_f429_claimed c
  JOIN integrations.samsara_drivers sd
    ON sd.operating_company_id = c.operating_company_id
   AND sd.samsara_driver_id    = c.samsara_driver_id
 WHERE EXISTS (SELECT 1 FROM mdata.drivers d WHERE d.id = c.driver_id)
ON CONFLICT DO NOTHING;

-- Say out loud what moved, and what still disagrees. A migration that changes money-adjacent
-- linkage in silence is the thing the audit trail exists to prevent.
DO $$
DECLARE moved int; conflicting int;
BEGIN
  SELECT count(*) INTO moved FROM sam_f429_claimed;

  SELECT count(*) INTO conflicting
    FROM integrations.samsara_drivers sd
    JOIN mdata.driver_samsara_accounts a
      ON a.operating_company_id = sd.operating_company_id
     AND a.samsara_driver_id    = sd.samsara_driver_id
     AND a.is_active
   WHERE sd.local_driver_id IS NOT NULL
     AND sd.local_driver_id <> a.driver_id;

  RAISE NOTICE 'SAM-F429: backfilled % Samsara user(s) into the canonical map.', moved;
  IF conflicting > 0 THEN
    RAISE NOTICE 'SAM-F429: % user(s) name a DIFFERENT driver in the legacy column than in the canonical map. The canonical map is left as it is; these need a human on the Mapping page.', conflicting;
  END IF;
END $$;

COMMIT;
