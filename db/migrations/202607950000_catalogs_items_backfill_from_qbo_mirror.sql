-- 202607950000_catalogs_items_backfill_from_qbo_mirror.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] LST-PICKER-02 companion.
--
-- ROOT CAUSE: the WO/Bill item picker READ mdata.qbo_items (the QBO mirror) while the inline
-- "+ Add new item" quick-create WROTE catalogs.items (canonical), so an item created from the
-- picker was invisible in that same picker after reload. The code fix repoints both readers to
-- catalogs.items.
--
-- WHY THIS MIGRATION EXISTS: repointing alone would have EMPTIED TRK's item picker. Verified on
-- prod br-fancy-credit-akjnd07a 2026-07-25 (lucia bypass):
--     catalogs.items   — TRANSP 189, TRK 0,  USMCA 0
--     mdata.qbo_items  — TRANSP 180, TRK 48, USMCA 0
-- TRK has 48 items that exist ONLY in the mirror. This backfills them into the canonical catalog so
-- no entity loses its picker when the readers move.
--
-- SAFETY:
--   * ADDITIVE only — inserts, never updates or deletes an existing catalogs.items row.
--   * Same-entity only — operating_company_id is copied straight from the mirror row; nothing crosses entities.
--   * Idempotent — skips any (operating_company_id, qbo_item_id) already present, so re-running is a no-op.
--   * Deactivated mirror rows land deactivated (deactivated_at set), preserving void-not-delete.
--   * No GL/posting effect: catalogs.items is a reference catalog, not a ledger.

BEGIN;

INSERT INTO catalogs.items (
  operating_company_id, item_name, item_code, item_type, unit_price_cents,
  qbo_item_id, deactivated_at, created_at, updated_at
)
SELECT
  q.operating_company_id,
  q.name,
  q.sku,
  q.item_type,
  q.unit_price_cents,
  q.qbo_id,
  CASE WHEN q.active THEN NULL ELSE now() END,
  now(),
  now()
FROM mdata.qbo_items q
WHERE q.name IS NOT NULL
  AND btrim(q.name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.items c
    WHERE c.operating_company_id = q.operating_company_id
      AND c.qbo_item_id IS NOT DISTINCT FROM q.qbo_id
  )
  -- Never shadow an existing canonical row that already carries the same name for this entity.
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.items c2
    WHERE c2.operating_company_id = q.operating_company_id
      AND lower(btrim(c2.item_name)) = lower(btrim(q.name))
  );

-- Verification — every entity that has mirror items must now have canonical items.
DO $verify$
DECLARE
  v_gap int;
  v_rec record;
BEGIN
  SELECT count(*) INTO v_gap
  FROM (
    SELECT q.operating_company_id
    FROM mdata.qbo_items q
    GROUP BY q.operating_company_id
    HAVING count(*) > 0
       AND NOT EXISTS (
         SELECT 1 FROM catalogs.items c
         WHERE c.operating_company_id = q.operating_company_id
       )
  ) gaps;

  FOR v_rec IN
    SELECT c.operating_company_id::text AS opco, count(*) AS n
    FROM catalogs.items c GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE 'LST-PICKER-02 backfill: catalogs.items opco=% rows=%', v_rec.opco, v_rec.n;
  END LOOP;

  IF v_gap <> 0 THEN
    RAISE EXCEPTION 'LST-PICKER-02: % entity(ies) still have mirror items but no canonical items', v_gap;
  END IF;
END
$verify$;

COMMIT;
