-- E8 / row 261 (LEAD, owner 11-03 13:31 CT "you are the lead, you can do anything necessary").
--
-- Actual vs Projected showed $0.00 projected expenses on almost every day: it read accounting.bills only, and the
-- morning snapshot (202613180000) captured income only. The engine fix (cash-flow.service.ts getDailyExpenseItems)
-- makes the AvP projected expense the daily engine's own number for today and later; a PAST day needs the engine's
-- number as it stood that morning, because the engine's sources retreat once paid/matched. This column carries it.
--
-- Nullable on purpose: NULL = the row was captured before expense capture existed → the screen says "not captured",
-- never $0 and never a reconstruction. No backfill (a backfill would be a guess about a past morning). Additive only;
-- the table stays append-only (202613180000 REVOKE UPDATE, DELETE untouched; INSERT grant already covers the column).
ALTER TABLE forecast.cash_flow_projection_snapshots
  ADD COLUMN IF NOT EXISTS projected_expense_cents bigint;

COMMENT ON COLUMN forecast.cash_flow_projection_snapshots.projected_expense_cents IS
  'E8: getDailyPrediction().expense_subtotal_cents captured at 06:10 CT for prediction_date; NULL = captured before expense capture existed (not captured, never 0).';
