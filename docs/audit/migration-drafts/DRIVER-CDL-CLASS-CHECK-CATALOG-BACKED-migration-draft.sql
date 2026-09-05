-- DRIVER-CDL-CLASS-CHECK-CATALOG-BACKED (owner packet 2026-09-04, PART 4). READY-TO-APPLY DRAFT,
-- not committed by CC-3 (no-migrations lane, per this seat's own packet header).
-- Handoff target: CC-1 (or any authorMigrations:true seat).
--
-- Renumber to the next real migration number before applying (checked live 2026-09-04: confirm
-- the actual next-free number in db/migrations/ at apply time -- do not trust this comment).

-- ============================================================================
-- ROOT CAUSE (verified live, tiny-field-89581227, 2026-09-04):
-- mdata.drivers.cdl_class has a real DB CHECK constraint:
--   drivers_cdl_class_check: CHECK (cdl_class IS NULL OR cdl_class = ANY (ARRAY['A','B','C']))
-- This predates the catalog widening documented in CreateDriverModal.tsx
-- (DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG): the frontend Zod schema
-- was widened from z.enum(["A","B","C"]) to bounded free text reading the live
-- reference.license_classes catalog (9 active codes: A, AM, B, BM, C, CDL-A, CDL-B, CDL-C, CM),
-- but nobody updated the DB constraint underneath it. Submitting any of the 6 non-A/B/C catalog
-- codes (AM, BM, CM, CDL-A, CDL-B, CDL-C) still hard-fails at the database with a constraint
-- violation today -- the frontend fix is incomplete, not just historically documented as such.
--
-- The owner separately flagged that the Mexican federal license "Categoría E" class has no
-- catalog row at all (a genuine content gap, not a schema one -- addable via the picker's own
-- "+Add new" inline-create flow once this constraint stops hardcoding a 3-value list).
--
-- FIX: repoint the constraint to the SAME live catalog the frontend already reads (the
-- "repoint the reader, never create a parallel home" pattern), rather than hardcoding a longer
-- but still-static list that will drift again the next time a class is added via the catalog's
-- own inline-create. Live-verified 2026-09-04: only 'A' (9 rows) and 'B' (12 rows) are currently
-- used on mdata.drivers, both already active reference.license_classes rows -- this migration is
-- additive/widening only, zero existing rows would violate it.
-- ============================================================================
ALTER TABLE mdata.drivers DROP CONSTRAINT drivers_cdl_class_check;
ALTER TABLE mdata.drivers ADD CONSTRAINT drivers_cdl_class_check CHECK (
  cdl_class IS NULL
  OR EXISTS (
    SELECT 1 FROM reference.license_classes rlc
    WHERE rlc.code = mdata.drivers.cdl_class
      AND rlc.archived_at IS NULL
  )
);

-- After this lands, the owner (or any operator via the CDL Class picker's "+Add new") can add a
-- "Categoría E" (or any other Mexican federal license class) row to reference.license_classes and
-- it becomes a valid cdl_class immediately, with no further migration needed for that class or any
-- future one -- closing the class of defect this constraint drift represents, not just this instance.
