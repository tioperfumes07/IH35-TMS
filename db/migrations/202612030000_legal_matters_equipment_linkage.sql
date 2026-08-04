-- CLS-REVERSE-LINKAGE-MISSING — legal.matters <-> mdata.equipment (trailer) two-way linkage.
--
-- ROOT CAUSE
-- The reverse "Legal Matters" panel is embedded on the VEHICLE profile via legal.matters.unit_id,
-- and the audit card asked for the same panel on the TRAILER profile. It could not simply be
-- rendered there: trailers are rows in mdata.equipment, NOT mdata.units, so passing a trailer id as
-- unit_id would query a different table's key space. The panel would have rendered, looked wired,
-- and returned empty forever - the worst kind of gap, because a permanently-empty surface reads as
-- "no legal matters on this trailer" rather than "this link does not exist". Honest wiring needs a
-- real column.
--
-- WHAT THIS DOES
-- Adds legal.matters.equipment_id: nullable, FK to mdata.equipment(id), indexed for the reverse
-- lookup. Additive and idempotent - no existing column is altered, renamed, or dropped, and no row
-- is written, so this is reversible and changes no existing behaviour on its own.
--
-- NOT A MONEY MIGRATION: legal.matters is not accounting.*/catalogs.accounts, no GL, posting,
-- balance, period, or grant semantics are touched.

DO $$
BEGIN
  -- Guard on the FK target existing so a fresh-DB CI run cannot half-apply this.
  IF to_regclass('mdata.equipment') IS NULL THEN
    RAISE NOTICE 'mdata.equipment absent - skipping legal.matters.equipment_id linkage';
    RETURN;
  END IF;

  IF to_regclass('legal.matters') IS NULL THEN
    RAISE NOTICE 'legal.matters absent - skipping legal.matters.equipment_id linkage';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'legal' AND table_name = 'matters' AND column_name = 'equipment_id'
  ) THEN
    ALTER TABLE legal.matters ADD COLUMN equipment_id uuid NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matters_equipment_id_fkey'
  ) THEN
    ALTER TABLE legal.matters
      ADD CONSTRAINT matters_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES mdata.equipment(id);
  END IF;
END $$;

-- Reverse-lookup index: the panel queries "all matters for THIS trailer", entity-scoped.
CREATE INDEX IF NOT EXISTS idx_matters_equipment_id
  ON legal.matters (operating_company_id, equipment_id)
  WHERE equipment_id IS NOT NULL;

COMMENT ON COLUMN legal.matters.equipment_id IS
  'Reverse linkage to mdata.equipment (trailers). Parallel to unit_id, which targets mdata.units. '
  'Trailers are equipment, not units - the two key spaces are distinct and must not be conflated.';
