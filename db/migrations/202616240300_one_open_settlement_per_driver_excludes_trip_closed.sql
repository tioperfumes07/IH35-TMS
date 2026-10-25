-- LEAD 443.339 — "one open settlement per driver" means one settlement OPEN FOR NEW LOADS.
-- Since ENG-01 (tg_settlement_close_requires_posting: 'closed' only together with posted_at) a load-bookended settlement
-- stays status 'open' from its trip close until its GL post commits (the after-commit postLoadBookendedSettlementGlAfterClose).
-- The old predicate (status = 'open') then refused the driver's next settlement while the previous one waited on its post
-- (measured on a prod fork 10-24: 13700 / P-0122). Every reuse query already reads "open for new loads" as
-- status = 'open' AND trip_closed_at IS NULL (getActiveSettlementForDriver, openLoadBookendedSettlement,
-- presettlement-link.service); the index now says the same thing.
DROP INDEX IF EXISTS driver_finance.uq_driver_settlements_one_open_per_driver;
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlements_one_open_per_driver
  ON driver_finance.driver_settlements (operating_company_id, driver_id)
  WHERE status = 'open' AND trip_closed_at IS NULL;
