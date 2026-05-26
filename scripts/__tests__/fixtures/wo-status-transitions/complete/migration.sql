CREATE OR REPLACE FUNCTION maintenance.enforce_wo_completion_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_wo_completion_invariants ON maintenance.work_orders;
CREATE TRIGGER trg_enforce_wo_completion_invariants
BEFORE UPDATE ON maintenance.work_orders
FOR EACH ROW
EXECUTE FUNCTION maintenance.enforce_wo_completion_invariants();
