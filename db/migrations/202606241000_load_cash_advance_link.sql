-- [HOLD-FOR-JORGE — TIER 1] Load ↔ cash-advance link.
--
-- Jorge's locked decision (2026-06-24): a dispatcher-booked CASH advance traces to its originating load, but
-- the LOAD carries NO money columns — the money lives on the existing driver-advance rails
-- (driver_finance.cash_advance_requests → driver_advances → settlement_lines 'deduction'). This migration adds
-- only a NULLABLE load_id FK to the advance record (the request, + forwarded to the disbursed advance on owner
-- approval) so the advance can point back at the load. One source of truth; reuse the existing GL/settlement math.
--
-- Deliberately NOT here:
--   * NO cash_advance_cents / fuel_advance_cents columns on mdata.loads (decision: no raw money on the load).
--   * NO fuel-advance modeling. A FUEL advance is a TRUCK operating cost (fuel-card / Corpay), NEVER a driver
--     settlement deduction — wiring it as a driver debt would be double-recovery. No fuel-card persistence
--     target exists yet, so fuel advances are DEFERRED at the application layer (captured in audit, never routed
--     to a driver debt). No schema for it until that target is designed.
--
-- driver_finance is in the migration 0065 GRANT set + DEFAULT PRIVILEGES, so the new columns inherit the
-- ih35_app grants — no new GRANT needed. Additive, nullable, idempotent. No data change. RLS unaffected (RLS on
-- both tables already keys on operating_company_id; a nullable column adds no new policy surface). The load_id is
-- always a load in the SAME operating company as the advance (the booking creates both under one
-- app.operating_company_id), so the link is entity-scoped by construction.

DO $$
BEGIN
  ALTER TABLE driver_finance.cash_advance_requests ADD COLUMN IF NOT EXISTS load_id uuid NULL REFERENCES mdata.loads(id);
  ALTER TABLE driver_finance.driver_advances       ADD COLUMN IF NOT EXISTS load_id uuid NULL REFERENCES mdata.loads(id);
END $$;

CREATE INDEX IF NOT EXISTS idx_cash_advance_requests_load_id
  ON driver_finance.cash_advance_requests (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_advances_load_id
  ON driver_finance.driver_advances (load_id) WHERE load_id IS NOT NULL;

COMMENT ON COLUMN driver_finance.cash_advance_requests.load_id IS
  'Originating load when a CASH advance is booked at load creation (nullable; driver-initiated advances have none). No money columns on mdata.loads — the advance rails carry the money.';
COMMENT ON COLUMN driver_finance.driver_advances.load_id IS
  'Originating load, forwarded from cash_advance_requests.load_id on owner approval (nullable).';
