-- ENG-01 (CC-1 443.322) — a settlement cannot transition to status='closed' without posted_at
-- being set (either already set or set in the same UPDATE).
--
-- Root cause: settlement-payrun-close.routes.ts (the close-trip endpoint) called
-- stampTripClosedForBookendedSettlement and returned WITHOUT calling postLoadBookendedSettlementGlAfterClose.
-- Result: P-0113/P-0117/P-0119 (load_bookended) had status='closed', posted_at=NULL, 0 JE postings.
--
-- Code fix (same PR): stampTripClosedForBookendedSettlement no longer sets status='closed' itself.
-- closeSettlementPayRun sets status='closed' and posted_at atomically in one UPDATE, satisfying this
-- trigger for every settlement model including load_bookended.
--
-- Pattern: same BEFORE UPDATE trigger used on billing (AJK-08 pattern).

CREATE OR REPLACE FUNCTION driver_finance.tg_settlement_close_requires_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Only fires when status is transitioning TO 'closed' from something else
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    -- All settlement models must set posted_at in the same UPDATE that sets status='closed'.
    IF NEW.posted_at IS NULL THEN
      RAISE EXCEPTION
        'settlement_close_requires_posting: settlement % (model=%) cannot be set to closed without posted_at (ACCT-ENG-01)',
        NEW.id, COALESCE(NEW.settlement_model, 'NULL')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

-- Drop the old non-bookended-only trigger function if it was previously applied
DROP TRIGGER IF EXISTS tg_settlement_non_bookended_close_requires_posting
  ON driver_finance.driver_settlements;
DROP FUNCTION IF EXISTS driver_finance.tg_settlement_non_bookended_close_requires_posting();

DROP TRIGGER IF EXISTS tg_settlement_close_requires_posting
  ON driver_finance.driver_settlements;

CREATE TRIGGER tg_settlement_close_requires_posting
  BEFORE UPDATE ON driver_finance.driver_settlements
  FOR EACH ROW
  EXECUTE FUNCTION driver_finance.tg_settlement_close_requires_posting();
