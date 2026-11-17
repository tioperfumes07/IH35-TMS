-- PERFUME-DESK (owner 2026-11-17 14:04 CT): "i need to have my last cost, avg cost column, and my list price … all price
-- boxes editable in my lists so i can change price and engine automatically calculates for that item the margin etc."
-- My own cost per item, typed on the desk: my last cost and my average cost. My inventory file's last cost still wins
-- when one is uploaded; this is what the owner types where no file carries it. Owner's own figures, stored as given.
-- Isolated perfume schema (ScentsX LLC), never posts to accounting. Additive, idempotent. No DELETE grant: a cost is
-- cleared by setting it to NULL; every change keeps who and when.
CREATE TABLE IF NOT EXISTS perfume.item_costs (
  item_id uuid PRIMARY KEY REFERENCES perfume.items(id),
  last_cost_cents integer CHECK (last_cost_cents IS NULL OR last_cost_cents BETWEEN 0 AND 10000000),
  avg_cost_cents integer CHECK (avg_cost_cents IS NULL OR avg_cost_cents BETWEEN 0 AND 10000000),
  edits jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE perfume.item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_costs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_costs_owner_only ON perfume.item_costs;
CREATE POLICY item_costs_owner_only ON perfume.item_costs USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.item_costs TO ih35_app;
