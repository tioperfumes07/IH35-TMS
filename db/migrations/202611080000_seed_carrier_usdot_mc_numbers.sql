-- COMP-F72 — seed the two REAL operating carriers' USDOT / MC numbers.
--
-- WHY: org.companies.usdot_number is NULL for TRANSP and TRK (verified on prod 2026-08-01), so the
-- CSA BASIC pull, FMCSA SAFER verification and every compliance surface keyed on USDOT are blocked
-- for the entities that actually run freight. COMP-F71 (#3975) already stopped USMCA's placeholder
-- reaching the live SAFER lookup; this supplies the missing real identifiers so the cron has
-- something legitimate to pull.
--
-- VALUES: sourced by GUARD from the public FMCSA/SAFER register and relayed by the owner:
--   IH 35 Transportation LLC  USDOT 2961978
--   IH 35 Trucking LLC        USDOT 2642732   MC 921203
-- No MC number was supplied for TRANSP, so none is written — a blank is honest, an invented docket
-- number is not. USMCA is untouched: it has no authority yet and keeps its explicit placeholder.
--
-- SAFETY: idempotent and NON-DESTRUCTIVE. Each UPDATE writes only where the column is currently
-- NULL, so re-running is a no-op and an owner-corrected value is never overwritten by a redeploy.
-- Scoped by company CODE, not a hardcoded UUID.
--
-- NOT a financial posting: no GL, no balances, no accounting.* table.

DO $$
BEGIN
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'org.companies absent — skipping COMP-F72 seed';
    RETURN;
  END IF;

  UPDATE org.companies
     SET usdot_number = '2961978',
         updated_at = now()
   WHERE code = 'TRANSP'
     AND usdot_number IS NULL;

  UPDATE org.companies
     SET usdot_number = '2642732',
         updated_at = now()
   WHERE code = 'TRK'
     AND usdot_number IS NULL;

  UPDATE org.companies
     SET mc_number = '921203',
         updated_at = now()
   WHERE code = 'TRK'
     AND mc_number IS NULL;
END $$;
