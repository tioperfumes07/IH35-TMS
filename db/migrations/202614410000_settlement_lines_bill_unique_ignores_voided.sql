-- 202614410000_settlement_lines_bill_unique_ignores_voided.sql
--
-- Claude-Lead, 2026-09-26. Live blocker: uniq_settlement_lines_source_driver_bill_id_line_type (202613510001) is
--   UNIQUE (source_driver_bill_id, line_type) WHERE source_driver_bill_id IS NOT NULL
-- with no voided_at predicate, so a VOIDED settlement line still occupies its (bill, line_type) slot and its corrected
-- reissue is refused. Void-never-delete cannot be honored on any bill-linked line (R-206: settlement 5792's load 13562
-- Empty Miles 20.20 -> 20.21 rolled back on this index). The invariant it protects — one ACTIVE line per bill and line
-- type — is kept exactly; voided history no longer blocks the correction.
--
-- The three ON CONFLICT callers in apps/backend/src/driver-finance/settlement-engine.ts change their arbiter predicate to
-- the same "source_driver_bill_id IS NOT NULL AND voided_at IS NULL" in the same PR (index inference needs the match).
--
-- Measured before authoring: 0 (source_driver_bill_id, line_type) pairs with 2+ non-voided rows, so the new index builds.
-- CANONICAL-CHECK: no new table; index predicate change only.

DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NULL THEN
    RAISE NOTICE '202614410000: driver_finance.settlement_lines absent — skipped';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM driver_finance.settlement_lines
     WHERE source_driver_bill_id IS NOT NULL AND voided_at IS NULL
     GROUP BY source_driver_bill_id, line_type HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '202614410000: duplicate active (source_driver_bill_id, line_type) rows exist — refusing';
  END IF;

  DROP INDEX IF EXISTS driver_finance.uniq_settlement_lines_source_driver_bill_id_line_type;
  CREATE UNIQUE INDEX uniq_settlement_lines_source_driver_bill_id_line_type
    ON driver_finance.settlement_lines (source_driver_bill_id, line_type)
    WHERE source_driver_bill_id IS NOT NULL AND voided_at IS NULL;
END $$;
