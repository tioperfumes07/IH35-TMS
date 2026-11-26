-- PERFUME-DESK (owner 2026-11-25 23:41 CT): "I'll tag or categorize vendors as vendors only trading distributors and
-- customer as well etc". Owner 23:09 CT: "Brian is Darielle Sean is victory international . They're both buyers and
-- suppliers". 23:25 CT: "Most of these vendors especially those that are expensive can be customers".
--
-- perfume.vendors.roles (the vendor toggles, owner 2026-11-23) gains two tags the OWNER sets on the desk:
--   distributor — the company is a distributor;
--   customer    — the company also buys from TIO.
-- "Vendor only" = no customer tag. purchase / trading / wholesale keep driving the desk tabs exactly as before; the two new
-- tags drive no tab and no import (kindOfRoles reads only purchase / trading / wholesale). Nothing infers a tag.
-- Additive (the allowed set only grows), idempotent; isolated perfume schema, RLS unchanged.

ALTER TABLE perfume.vendors DROP CONSTRAINT IF EXISTS vendors_roles_check;
ALTER TABLE perfume.vendors ADD CONSTRAINT vendors_roles_check
  CHECK (roles <@ ARRAY['purchase', 'trading', 'wholesale', 'distributor', 'customer']::text[]);
