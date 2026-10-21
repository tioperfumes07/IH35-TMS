-- 202616040700_driver_dq_file_on_paper.sql  (CC-2, claimed on main first — LEAD 443.204)
-- OWNER 2026-10-21 15:27 CT (verbatim): "for the drivers we have right now, do not block loads, fix the rules, for new
-- drivers starting today we must create with the entire file, for the current drivers, it cannot block, we do have the
-- files in person. so unblock all. of them."
--
-- Measured on prod 10-21: none of the 7 USMCA drivers on loads 13687–13695 has a DOT medical card in the app, and 3 have
-- no CDL expiry — their DQ files are on paper. The shared gate (dispatch/driver-qualification.service.ts) refused every
-- booking with E_DRIVER_NOT_QUALIFIED medical_card_missing / cdl_missing.
--
-- 1. mdata.drivers.dq_file_on_paper_since — set ONLY here, for every driver that exists in USMCA when this migration runs
--    (home company USMCA, or authorized to drive for USMCA). The gate never blocks such a driver on a missing / expired
--    CDL, medical card or H endorsement, nor on HOS; it records "DQ file held on paper (owner 10-21)" instead. Recorded
--    violations (deactivated / inactive, drug & alcohol, Clearinghouse) still block.
-- 2. A driver created after this migration carries NULL: the full gate applies, and driver create requires the file.
--
-- IDEMPOTENT + FRESH-DB SAFE: ADD COLUMN IF NOT EXISTS; the stamp only fills NULLs; no USMCA -> nothing stamped.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

ALTER TABLE mdata.drivers ADD COLUMN IF NOT EXISTS dq_file_on_paper_since timestamptz;

COMMENT ON COLUMN mdata.drivers.dq_file_on_paper_since IS
  'LEAD 443.204 (owner 2026-10-21 15:27 CT): this driver existed when the app took over and the DQ file is held on paper. The driver-qualification gate records, never blocks, a missing / expired CDL, medical card, H endorsement or an HOS violation. Set only by migration 202616040700; NULL for every driver created after it (full file required at create).';

UPDATE mdata.drivers d
   SET dq_file_on_paper_since = now()
 WHERE d.dq_file_on_paper_since IS NULL
   AND (
     d.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
     OR EXISTS (
       SELECT 1 FROM mdata.driver_company_authorizations a
        WHERE a.driver_id = d.id
          AND a.company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
          AND a.is_authorized = true
          AND a.deactivated_at IS NULL
     )
   );

COMMIT;
