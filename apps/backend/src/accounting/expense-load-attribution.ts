/**
 * LEAD 443.128 B (N1) — an expense that names a load takes the load's unit, driver and trailer; a different one is refused by
 * name, never silently stored. The same values go on every expense line.
 *   unit    — mdata.loads.assigned_unit_id;
 *   driver  — the load's primary driver (its secondary driver is also accepted on a team load);
 *   trailer — the load's trailer choice: the company trailer (accounting/load-trailer.sql.ts, recorded by the assignment), the
 *             customer's non-owned trailer, or "none" (bobtail / power only — a supplied trailer is then refused).
 * Pure reconcile (reconcileExpenseWithLoad) + one read (readLoadAttribution).
 */
import { loadNonOwnedTrailerSql, sameEntityLoadCompanyTrailerSql } from "./load-trailer.sql.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export type LoadAttribution = {
  unitId: string | null;
  primaryDriverId: string | null;
  secondaryDriverId: string | null;
  companyTrailerId: string | null;
  nonOwnedTrailerId: string | null;
  trailerSource: string | null;
};

export type ExpenseAttribution = { unitId: string | null; driverId: string | null; trailerId: string | null; nonOwnedTrailerId: string | null };

export type ExpenseLoadMismatch = { mismatch: "unit" | "driver" | "trailer"; supplied: string; load: string | null };

export async function readLoadAttribution(client: Queryable, operatingCompanyId: string, loadId: string): Promise<LoadAttribution | null> {
  const r = (await client.query(
    `SELECT l.assigned_unit_id::text AS unit_id, l.assigned_primary_driver_id::text AS primary_driver_id,
            l.assigned_secondary_driver_id::text AS secondary_driver_id, l.trailer_source::text AS trailer_source,
            ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")}::text AS company_trailer_id,
            ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")}::text AS non_owned_trailer_id
       FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  )).rows[0] as
    | { unit_id: string | null; primary_driver_id: string | null; secondary_driver_id: string | null; trailer_source: string | null; company_trailer_id: string | null; non_owned_trailer_id: string | null }
    | undefined;
  if (!r) return null;
  return {
    unitId: r.unit_id,
    primaryDriverId: r.primary_driver_id,
    secondaryDriverId: r.secondary_driver_id,
    companyTrailerId: r.company_trailer_id,
    nonOwnedTrailerId: r.non_owned_trailer_id,
    trailerSource: r.trailer_source,
  };
}

/** Pure: the expense's unit / driver / trailer given what the caller supplied and the load it names. */
export function reconcileExpenseWithLoad(
  supplied: { unitId?: string | null; driverId?: string | null; trailerId?: string | null },
  load: LoadAttribution
): ExpenseAttribution | ExpenseLoadMismatch {
  const unit = supplied.unitId ?? null;
  if (unit && load.unitId && unit !== load.unitId) return { mismatch: "unit", supplied: unit, load: load.unitId };
  const driver = supplied.driverId ?? null;
  const loadDrivers = [load.primaryDriverId, load.secondaryDriverId].filter((d): d is string => Boolean(d));
  if (driver && loadDrivers.length && !loadDrivers.includes(driver)) return { mismatch: "driver", supplied: driver, load: load.primaryDriverId };
  const trailer = supplied.trailerId ?? null;
  // The explicit current choice wins over retained assignment history. Editing company -> none
  // does not delete that history; it must not resurrect the old trailer on a new expense.
  if (load.trailerSource === "none" && trailer) {
    return { mismatch: "trailer", supplied: trailer, load: "no trailer" };
  }
  if (trailer) {
    if (load.companyTrailerId && trailer !== load.companyTrailerId) return { mismatch: "trailer", supplied: trailer, load: load.companyTrailerId };
    // The load said "no trailer" or rides the customer's trailer: a company trailer on its expense contradicts it.
    if (!load.companyTrailerId && (load.trailerSource === "none" || load.nonOwnedTrailerId)) {
      return { mismatch: "trailer", supplied: trailer, load: load.nonOwnedTrailerId ? `customer trailer ${load.nonOwnedTrailerId}` : "no trailer" };
    }
  }
  return {
    unitId: unit ?? load.unitId,
    driverId: driver ?? load.primaryDriverId,
    trailerId: load.trailerSource === "none" ? null : trailer ?? load.companyTrailerId,
    nonOwnedTrailerId: load.trailerSource === "none" || trailer ? null : load.nonOwnedTrailerId,
  };
}

export const EXPENSE_LOAD_MISMATCH_ERROR: Record<ExpenseLoadMismatch["mismatch"], string> = {
  unit: "unit_load_mismatch",
  driver: "driver_load_mismatch",
  trailer: "trailer_load_mismatch",
};
