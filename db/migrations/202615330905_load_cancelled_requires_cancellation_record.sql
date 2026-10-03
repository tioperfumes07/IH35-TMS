-- 202615330905 · CC-3 · ROUND 353 — close the route that produced load 13515. AUTH-201's script set
-- mdata.loads.status = 'cancelled' with a bare UPDATE, so the load carried no dispatch.load_cancellations row (no reason,
-- no maker) and its void was never stamped. The cancellation engine (apps/backend/src/dispatch/cancellation.service.ts)
-- always writes the record in the SAME transaction as the status flip — direct cancel writes it 'approved' before the
-- flip; approveCancellation() moves it 'requested' -> 'approved' before the flip.
-- Rule, enforced at COMMIT (deferred, so either write order inside one transaction passes): a load may only MOVE to
-- 'cancelled' — insert as cancelled, or change from another status to cancelled — while an approved
-- dispatch.load_cancellations row exists for it. A load already cancelled is not re-checked on unrelated updates.
-- Measured on prod under SET LOCAL app.bypass_rls = 'lucia' (2026-10-03, after AUTH-206): 1 cancelled load without an
-- approved record, E2E-2E-95603e75 (test residue, purge population) — untouched; the rule only gates transitions.
-- Idempotent.

CREATE OR REPLACE FUNCTION dispatch.refuse_load_cancel_without_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text <> 'cancelled' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'cancelled' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM dispatch.load_cancellations lc
     WHERE lc.load_id = NEW.id AND lc.operating_company_id = NEW.operating_company_id AND lc.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'load % cannot become cancelled without an approved dispatch.load_cancellations row — cancel through dispatch/cancellation.service.ts', NEW.load_number
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_load_cancelled_requires_cancellation_record ON mdata.loads;
CREATE CONSTRAINT TRIGGER trg_load_cancelled_requires_cancellation_record
  AFTER INSERT OR UPDATE OF status ON mdata.loads
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION dispatch.refuse_load_cancel_without_record();
