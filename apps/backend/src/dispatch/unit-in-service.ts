/**
 * LEAD 443.231b — free / assignable unit gate shared by Truck Line AVAILABLE and
 * GET /dispatch/units-without-load. Same units on both surfaces.
 *
 * = THE board unit gate (COALESCE leased/owner) + not OOS + no open work order.
 */
import { openWorkOrderPredicateSql } from "../maintenance/in-shop-condition.js";
import { canonicalBoardUnitGateSql } from "./canonical-active-load-set.js";

export const UNIT_IN_SERVICE_SQL = `
  ${canonicalBoardUnitGateSql("u", "$1::uuid")}
  AND u.is_oos IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1 FROM maintenance.work_orders wo
    WHERE wo.unit_id = u.id AND wo.operating_company_id = $1::uuid
      AND ${openWorkOrderPredicateSql("wo")}
  )
`;
