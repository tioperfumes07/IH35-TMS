-- GO-LIVE 2E: sold units -> Inactive (drop from active fleet). Jorge decision, locked.
--
-- Measured on prod: 39 units have status='Sold' AND deactivated_at IS NULL — counted as active, inflating
-- the fleet count and surfacing long-sold trucks (sold 3-10 yrs ago) in dispatch dropdowns. This sets
-- deactivated_at on exactly those 39 so they drop from the active fleet, dispatch truck/trailer dropdowns
-- (the unified fleet list already filters deactivated_at IS NULL), and the maintenance fleet KPIs (which
-- already filter deactivated_at IS NULL). status STAYS 'Sold' — preserve the real disposition; do NOT flip
-- to a generic Inactive.
--
-- NO retroactive financial disposal entry: these are historical sales in closed/filed tax years; posting
-- disposals retroactively would corrupt the books. Proper fixed-asset disposal accounting (remove asset +
-- accumulated depreciation, book gain/loss into the Finance Hub) is a SEPARATE FUTURE Tier-1 (money)
-- research+build item governing FUTURE sales only — TRACKER: "Fixed-asset disposal accounting (sold-unit ->
-- gain/loss to Finance Hub)" — NOT now, NOT retroactive.
--
-- mdata only — disjoint from Path B. Idempotent (re-run matches 0 rows). Reversible:
--   UPDATE mdata.units SET deactivated_at = NULL WHERE status = 'Sold';

BEGIN;

UPDATE mdata.units
   SET deactivated_at = now(),
       status_change_reason = COALESCE(status_change_reason, 'Sold unit retired from active fleet (go-live 2E)')
 WHERE status = 'Sold'
   AND deactivated_at IS NULL;

COMMIT;
