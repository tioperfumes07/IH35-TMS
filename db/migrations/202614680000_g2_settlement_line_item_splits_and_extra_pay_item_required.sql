-- G2 (ROUND 292/293) — CC-1
-- 1. driver_finance.settlement_line_item_splits: a permanent, append-only mapping record from a
--    merged settlement_line (line_type='extra_pay', item_id NULL, created by a historical
--    AlwaysTrack-feed import that materialized 2-5 real document lines into one generic row) to
--    its real constituent items. This lets the item detail be audited without ever touching the
--    signed settlement document or the settlement_line row itself (owner ruling: those 17 rows
--    sit in settlements 5769-5819, closed, verified 51/51 against AlwaysTrack, never re-opened).
-- 2. A NOT VALID check constraint on driver_finance.settlement_lines: any FUTURE extra_pay line
--    must carry a real item_id. NOT VALID means it is enforced for every new INSERT/UPDATE from
--    this point forward but does not retroactively fail the 17 existing legacy rows (deliberately
--    grandfathered, corrected via the split table above, not by touching the closed settlements).
--    This is the permanent engine-side fix: the next AlwaysTrack import cannot recreate G2.

CREATE TABLE IF NOT EXISTS driver_finance.settlement_line_item_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  settlement_line_id uuid NOT NULL REFERENCES driver_finance.settlement_lines(id),
  sequence integer NOT NULL,
  item_id uuid NOT NULL REFERENCES catalogs.items(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  description text,
  adjusting_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  UNIQUE (settlement_line_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_settlement_line_item_splits_line
  ON driver_finance.settlement_line_item_splits (settlement_line_id);
CREATE INDEX IF NOT EXISTS idx_settlement_line_item_splits_opco
  ON driver_finance.settlement_line_item_splits (operating_company_id);

ALTER TABLE driver_finance.settlement_line_item_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.settlement_line_item_splits FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'driver_finance' AND tablename = 'settlement_line_item_splits'
       AND policyname = 'settlement_line_item_splits_opco_scope'
  ) THEN
    CREATE POLICY settlement_line_item_splits_opco_scope
      ON driver_finance.settlement_line_item_splits
      USING (
        identity.is_lucia_bypass()
        OR operating_company_id::text = current_setting('app.operating_company_id', true)
      );
  END IF;
END $$;

GRANT SELECT, INSERT ON driver_finance.settlement_line_item_splits TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'settlement_lines_extra_pay_requires_item'
  ) THEN
    ALTER TABLE driver_finance.settlement_lines
      ADD CONSTRAINT settlement_lines_extra_pay_requires_item
      CHECK (line_type IS DISTINCT FROM 'extra_pay' OR item_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
