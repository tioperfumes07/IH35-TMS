BEGIN;

CREATE OR REPLACE FUNCTION accounting.period_cash_basis_snapshot_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.computed_at IS NOT NULL THEN
    RAISE EXCEPTION 'IH35_CASH_BASIS_SNAPSHOT_LOCKED period_id=%', OLD.period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.computed_at IS NOT NULL THEN
    RAISE EXCEPTION 'IH35_CASH_BASIS_SNAPSHOT_LOCKED period_id=%', OLD.period_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

GRANT EXECUTE ON FUNCTION accounting.period_cash_basis_snapshot_block_mutation() TO ih35_app;

DROP TRIGGER IF EXISTS trg_period_cash_basis_snapshot_lock ON accounting.period_cash_basis_snapshot;
CREATE TRIGGER trg_period_cash_basis_snapshot_lock
  BEFORE UPDATE OR DELETE ON accounting.period_cash_basis_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION accounting.period_cash_basis_snapshot_block_mutation();

DROP POLICY IF EXISTS period_cash_basis_snapshot_company_scope ON accounting.period_cash_basis_snapshot;
CREATE POLICY period_cash_basis_snapshot_company_scope ON accounting.period_cash_basis_snapshot
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;
