-- BOARD-29-BATCH (2026-11-13): indexes supporting batchBuildClosedTourRows.
-- The closed-tour list query joins mdata.loads on presettlement_link_id and
-- driver_finance.settlement_lines on (settlement_id, load_id); without these
-- indexes the batch CTE scans both tables in full for every settlement.
CREATE INDEX IF NOT EXISTS idx_loads_presettlement_link_id
  ON mdata.loads (presettlement_link_id)
  WHERE presettlement_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_df_settlement_lines_settlement_load
  ON driver_finance.settlement_lines (settlement_id, load_id)
  WHERE load_id IS NOT NULL AND is_active = true AND voided_at IS NULL;
