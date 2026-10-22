import { assignmentInCompanySql } from "../maintenance/driver-attribution.js";

/**
 * LEAD 443.231b — ONE driver read for a unit on every board view.
 *
 * Order (same as unit-aggregate / Trip Pairing current-driver):
 *  1) Open telematics.vehicle_driver_assignments (current ELD login on the unit)
 *  2) Else primary driver of the unit's most recent delivered / closed load
 *
 * Never `mdata.units.assigned_driver_id` (Rule 49: 0% populated on USMCA — every Unassigned
 * row rendered "—" while Truck Line named drivers from HOS-free last-unit logic).
 *
 * Both Truck Line AVAILABLE and GET /dispatch/units-without-load MUST use these fragments so
 * the unit set + driver per unit cannot drift.
 *
 * OPERATIONAL (not HISTORY): resolves the current driver for USMCA board attribution.
 * VDA reads are company-pinned via assignmentInCompanySql (frozen-company history law).
 */

/** Open VDA (current ELD pairing) for one unit — 0 or 1 row. */
export function unitOpenVdaDriverLateralSql(unitAlias: string, companyParam: string): string {
  return `
    LEFT JOIN LATERAL (
      SELECT a.driver_id
        FROM telematics.vehicle_driver_assignments a
       WHERE a.unit_id = ${unitAlias}.id
         AND a.operating_company_id = ${companyParam}
         AND ${assignmentInCompanySql("a")}
         AND a.ended_at IS NULL
         AND a.driver_id IS NOT NULL
       ORDER BY a.started_at DESC
       LIMIT 1
    ) unit_vda ON true`;
}

/** Primary driver of the unit's most recent delivered/closed load — 0 or 1 row. */
export function unitLastDeliveredDriverLateralSql(unitAlias: string, companyParam: string): string {
  return `
    LEFT JOIN LATERAL (
      SELECT l.assigned_primary_driver_id AS driver_id,
             l.load_number AS last_closed_load_number
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT s.actual_departure_at
            FROM mdata.load_stops s
           WHERE s.load_id = l.id
             AND s.stop_type = 'delivery'
             AND s.soft_deleted_at IS NULL
           ORDER BY s.sequence_number DESC
           LIMIT 1
        ) del ON true
       WHERE l.assigned_unit_id = ${unitAlias}.id
         AND l.operating_company_id = ${companyParam}
         AND l.soft_deleted_at IS NULL
         AND l.assigned_primary_driver_id IS NOT NULL
         AND l.status::text IN (
           'delivered', 'delivered_pending_docs', 'completed_docs_received',
           'invoiced', 'paid', 'closed'
         )
       ORDER BY COALESCE(del.actual_departure_at, l.updated_at) DESC NULLS LAST
       LIMIT 1
    ) unit_last_drv ON true`;
}

/**
 * Join mdata.drivers on COALESCE(open VDA, last-delivered primary).
 * Requires `unit_vda` + `unit_last_drv` laterals already in the FROM list.
 * Alias for the drivers row: `ud` (caller SELECTs ud.id / names).
 */
export function unitCurrentDriverJoinSql(companyParam: string): string {
  return `
    LEFT JOIN mdata.drivers ud
      ON ud.id = COALESCE(unit_vda.driver_id, unit_last_drv.driver_id)
     AND (
       ud.operating_company_id = ${companyParam}
       OR EXISTS (
         SELECT 1 FROM mdata.driver_company_authorizations unit_current_driver_dca
          WHERE unit_current_driver_dca.driver_id = ud.id
            AND unit_current_driver_dca.company_id = ${companyParam}
            AND unit_current_driver_dca.is_authorized = true
            AND unit_current_driver_dca.deactivated_at IS NULL
       )
     )`;
}

/** Full trio: VDA lateral + last-delivered lateral + drivers join. */
export function unitCurrentDriverSql(unitAlias: string, companyParam: string): string {
  return [
    unitOpenVdaDriverLateralSql(unitAlias, companyParam),
    unitLastDeliveredDriverLateralSql(unitAlias, companyParam),
    unitCurrentDriverJoinSql(companyParam),
  ].join("\n");
}
