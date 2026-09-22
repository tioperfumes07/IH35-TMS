import { canonicalActiveLoadWhereClause } from "../../dispatch/canonical-active-load-set.js";
import type { Invariant, Queryable, ReconcilerException } from "../types.js";

const INVARIANT_ID = "I8";
const OWNER_SEAT = "CC-3";

type Field = "unit" | "trailer" | "driver" | "customer_reference";

const REASONS: Record<Field, string> = {
  unit: "No truck is assigned to this load.",
  trailer: "No trailer is assigned to this load.",
  driver: "No driver is assigned to this load.",
  customer_reference: "The load has no customer W.O. or PO number, so Faro cannot match it and it cannot be factored.",
};

type Row = {
  load_id: string;
  load_number: string;
  created_at: string;
  has_unit: boolean;
  has_trailer: boolean;
  has_driver: boolean;
  has_customer_reference: boolean;
};

/**
 * The live set is the canonical active-load predicate, imported, never restated. The trailer is
 * the most recent assignment-history row that set one (dispatch/quick-assign.service.ts
 * resolveCurrentTrailerId): mdata.loads.load_trailer_equipment_id is the equipment TYPE, not a
 * trailer. The customer reference is what Faro matches on (factoring/faro-csv-import.ts):
 * customer_wo_number, then customer_po_number.
 */
export const I8_SQL = `
  SELECT l.id::text AS load_id,
         l.load_number,
         l.created_at::text AS created_at,
         (l.assigned_unit_id IS NOT NULL) AS has_unit,
         (tr.new_trailer_id IS NOT NULL) AS has_trailer,
         (l.assigned_primary_driver_id IS NOT NULL) AS has_driver,
         (nullif(btrim(coalesce(l.customer_wo_number, '')), '') IS NOT NULL
           OR nullif(btrim(coalesce(l.customer_po_number, '')), '') IS NOT NULL) AS has_customer_reference
    FROM mdata.loads l
    LEFT JOIN LATERAL (
      SELECT lah.new_trailer_id
        FROM dispatch.load_assignment_history lah
       WHERE lah.load_id = l.id
         AND lah.operating_company_id = l.operating_company_id
         AND lah.new_trailer_id IS NOT NULL
       ORDER BY lah.assigned_at DESC, lah.created_at DESC, lah.id DESC
       LIMIT 1
    ) tr ON true
   WHERE l.operating_company_id = $1::uuid
     AND l.soft_deleted_at IS NULL
     AND l.is_sample_data IS NOT TRUE
     AND ${canonicalActiveLoadWhereClause("l")}
   ORDER BY l.load_number
`;

export function i8ExceptionsForRow(row: Row): ReconcilerException[] {
  const missing: Field[] = [];
  if (!row.has_unit) missing.push("unit");
  if (!row.has_trailer) missing.push("trailer");
  if (!row.has_driver) missing.push("driver");
  if (!row.has_customer_reference) missing.push("customer_reference");
  return missing.map((field) => ({
    key: `${INVARIANT_ID}/load/${row.load_id}/${field}`,
    invariant: INVARIANT_ID,
    entity_type: "load",
    entity_id: row.load_id,
    entity_label: row.load_number,
    field,
    reason: REASONS[field],
    since: row.created_at,
    since_source: "mdata.loads.created_at",
    owner_seat: OWNER_SEAT,
    repair_engine: null,
  }));
}

export const i8DispatchedLoadComplete: Invariant = {
  id: INVARIANT_ID,
  title: "A dispatched load has a truck, a trailer, a driver and a customer reference",
  ownerSeat: OWNER_SEAT,
  repairEngine: null,
  async detect(client: Queryable, operatingCompanyId: string) {
    const res = await client.query<Row>(I8_SQL, [operatingCompanyId]);
    return res.rows.flatMap(i8ExceptionsForRow);
  },
};
