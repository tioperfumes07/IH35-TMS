-- PERFUME margin groups (owner 2026-11-27 15:40 CT): "when wanting to change my margin, i need to have filters for the changes. so i
-- can set different percentages for different products, exclusive, new launches, testers, mini, sets, etc. regular goods etc."
-- Testers / minis / sets are read from the item's flags; Exclusive and New launch are the owner's own marks and had no field:
--   is_exclusive   Y = an exclusive product (its own margin)
--   is_new_launch  Y = a new launch (its own margin)
-- The group percentages live in the desk rules (perfume.settings rules group_margins / group_earn). Each edit is one item_events
-- 'attributes' row. Isolated perfume schema; no posting.
BEGIN;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS is_new_launch boolean NOT NULL DEFAULT false;
COMMIT;
