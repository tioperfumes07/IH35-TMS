-- PERFUME item creator — owner 2026-11-27 07:37 CT: "in the item creator it should have those rows and should be able to select from
-- list for each one". Items were only ever created from a vendor list line; the item file gains a "New item" form. Its history row is
-- kind 'created' (who, when, every field as entered). Widens the item_events kind CHECK (superset of 202617000100's list), nothing else.

BEGIN;

ALTER TABLE perfume.item_events DROP CONSTRAINT IF EXISTS item_events_kind_check;
ALTER TABLE perfume.item_events ADD CONSTRAINT item_events_kind_check
  CHECK (kind IN ('edited', 'tio_code', 'upc_added', 'upc_moved_in', 'upc_moved_out', 'hk_code_added', 'hk_code_moved_in', 'hk_code_moved_out',
                  'line_linked', 'codes_filled', 'attributes', 'created'));

COMMIT;
