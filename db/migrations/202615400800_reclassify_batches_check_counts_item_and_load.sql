-- 202615400800 — CC-2 (claimed #25086). Reclassify by load / by item was refused by the database.
--
-- U24 (202615380600) taught the one reclassify engine to move expense and bill lines to another ITEM and/or another LOAD,
-- and added accounting.reclassify_batches.to_item_id / to_load_id. It did not touch the batch's own CHECK:
--
--   reclassify_batches_changes_something:
--     CHECK (to_account_id IS NOT NULL OR to_class_id IS NOT NULL OR to_entity_uuid IS NOT NULL OR to_location_id IS NOT NULL)
--
-- An item move passes only because the engine fills to_account_id from the item's own account. A LOAD-only move (the
-- engine accepts it: applyReclassify refuses only when all six targets are empty) violates the CHECK, so every
-- "move these lines to another load" batch is refused at INSERT — found 2026-10-04 rehearsing the owner-authorized move of
-- receipt 99133290's DEF line to load 13534 on a Neon fork.
--
-- The CHECK keeps its meaning — a batch must change something — over the same six targets the engine accepts.
-- Nothing is backfilled; existing rows all satisfy the narrower old CHECK, so they satisfy this one.

ALTER TABLE accounting.reclassify_batches DROP CONSTRAINT IF EXISTS reclassify_batches_changes_something;
ALTER TABLE accounting.reclassify_batches
  ADD CONSTRAINT reclassify_batches_changes_something CHECK (
    to_account_id IS NOT NULL OR to_class_id IS NOT NULL OR to_entity_uuid IS NOT NULL OR to_location_id IS NOT NULL
    OR to_item_id IS NOT NULL OR to_load_id IS NOT NULL
  );
