/**
 * THE ONE LOAD SERVICE — owner law 2026-09-28 (docs/bus/00-ONE-LOAD-SERVICE-OWNER-LAW.md): "ALL LOAD BOARD VIEWS ARE ONE
 * SERVICE AND THE LOAD COSTS RENDERS THE COSTS FROM THOSE SAME SERVICES." LEAD 443.206R (10-21 22:58Z): views.live_loads is
 * the canonical active-load set and this module is its only reader. Every board (List, Kanban, Round Trips, Truck Line, Trip
 * Pairing, Planners, Overview tiles + panels, Homes, At-Risk / Late, Live Map, units-without-load, Driver Hub, profiles'
 * current load, customer open loads, GET /dispatch/loads) reads its loads through here; filters are ARGUMENTS, never a
 * second query. A narrower board narrows the STATUS half only (assertCanonicalSubset) — never the row set.
 *
 * States: open_dispatch (a unit is carrying it) · pre_settlement (delivered, round trip not settled) · live (both). History
 * (settled / closed / cancelled loads) is not a board: it reads mdata.loads directly in reports and single-load history only.
 */
export type LoadServiceState = "open_dispatch" | "pre_settlement" | "live";

/**
 * Membership of a mdata.loads row (aliased) in the requested live state — the SQL face of the service, for a board query that
 * joins its own detail columns. `operatingCompanyIdParam` is the caller's placeholder (e.g. "$1::uuid"); omit it only when
 * the caller already scopes the outer row to the user's companies.
 */
export function loadServiceMembershipSql(alias: string, state: LoadServiceState, operatingCompanyIdParam?: string): string {
  return loadServiceIdInSql(`${alias}.id`, state, operatingCompanyIdParam);
}

/** Same membership for a caller whose load id sits in another column (e.g. a view's or a join's `x.load_id`). */
export function loadServiceIdInSql(loadIdColumn: string, state: LoadServiceState, operatingCompanyIdParam?: string): string {
  const stateSql = state === "live" ? "" : ` AND v.live_state = '${state}'`;
  const coSql = operatingCompanyIdParam ? ` AND v.operating_company_id = ${operatingCompanyIdParam}` : "";
  return `${loadIdColumn} IN (SELECT v.id FROM views.live_loads v WHERE true${coSql}${stateSql})`;
}

type Queryable = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export type ListLoadsArgs = {
  operatingCompanyId: string;
  state: LoadServiceState;
  /** the narrower STATUS half (a subset of the state's statuses) — never a different row set */
  statuses?: readonly string[];
  unitId?: string;
  driverId?: string;
  customerId?: string;
};

/** The service's id read — what a board needs to join against, or a count. */
export async function listLoadServiceIds(client: Queryable, args: ListLoadsArgs): Promise<string[]> {
  const values: unknown[] = [args.operatingCompanyId];
  const where = [loadServiceMembershipSql("l", args.state, "$1::uuid"), "l.operating_company_id = $1::uuid"];
  if (args.statuses?.length) { values.push(args.statuses); where.push(`l.status::text = ANY($${values.length}::text[])`); }
  if (args.unitId) { values.push(args.unitId); where.push(`l.assigned_unit_id = $${values.length}::uuid`); }
  if (args.driverId) { values.push(args.driverId); where.push(`(l.assigned_primary_driver_id = $${values.length}::uuid OR l.assigned_secondary_driver_id = $${values.length}::uuid)`); }
  if (args.customerId) { values.push(args.customerId); where.push(`l.customer_id = $${values.length}::uuid`); }
  const res = await client.query<{ id: string }>(`SELECT l.id::text AS id FROM views.live_loads l WHERE ${where.join(" AND ")} ORDER BY l.load_number`, values);
  return res.rows.map((r) => r.id);
}

export async function countLoadService(client: Queryable, args: ListLoadsArgs): Promise<number> {
  return (await listLoadServiceIds(client, args)).length;
}

/**
 * LEAD 443.206R item 4 (register C1–C3) — ONE row projection for a board row: the load's driver, unit and trailer read ONE way.
 *   driver  (D1+D2): the load's primary driver's FULL name, company-checked, else the same-company resolver (archived driver);
 *   unit    (U1): lease-aware — the unit row only when leased to, else owned by, the load's company;
 *   trailer (T1): the newest assignment-history trailer row of the load whose equipment belongs to the load's company.
 * A short "J. Smith" label is a separate field (loadServiceDriverShortLabelSql), never an overwrite of the full name.
 */
export function loadServiceDriverNameSql(loadAlias: string, driverAlias: string): string {
  return `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ${driverAlias}.first_name, ${driverAlias}.last_name)), ''),
    mdata.resolve_driver_label_same_company(${loadAlias}.assigned_primary_driver_id, ${loadAlias}.operating_company_id))`;
}
export function loadServiceDriverShortLabelSql(loadAlias: string, driverAlias: string): string {
  return `COALESCE(CASE WHEN ${driverAlias}.id IS NULL THEN NULL ELSE CONCAT(LEFT(${driverAlias}.first_name, 1), '. ', ${driverAlias}.last_name) END,
    mdata.resolve_driver_label_same_company(${loadAlias}.assigned_primary_driver_id, ${loadAlias}.operating_company_id))`;
}
export function loadServiceUnitJoinSql(loadAlias: string, unitAlias: string): string {
  return `LEFT JOIN mdata.units ${unitAlias} ON ${unitAlias}.id = ${loadAlias}.assigned_unit_id
    AND COALESCE(${unitAlias}.currently_leased_to_company_id, ${unitAlias}.owner_company_id) = ${loadAlias}.operating_company_id`;
}
export function loadServiceTrailerLateralSql(loadAlias: string, trailerAlias: string): string {
  return `LEFT JOIN LATERAL (
    SELECT eq.id, eq.equipment_number, eq.equipment_type
      FROM dispatch.load_assignment_history lah
      JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id
       AND COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = ${loadAlias}.operating_company_id
     WHERE lah.load_id = ${loadAlias}.id AND lah.operating_company_id = ${loadAlias}.operating_company_id AND lah.new_trailer_id IS NOT NULL
     ORDER BY lah.assigned_at DESC, lah.created_at DESC
     LIMIT 1) ${trailerAlias} ON true`;
}
