import type { FleetTypeFilter } from "./fleet-type-filter.js";
import { trailerTypeSqlFilter, truckTypeSqlFilter } from "./fleet-type-filter.js";
// Demo/phantom hygiene (E1) now lives in ONE place so the roster and the maintenance fleet KPI cannot
// drift apart again — see fleet-visibility.ts for the live divergence that caused the move.
import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";

type PgClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type UnifiedFleetRow = {
  id: string;
  kind: "truck" | "trailer";
  unit_number: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  type: string;
  status: string;
  reefer_summary: string | null;
  operating_company_id: string | null;
  is_oos?: boolean;
  vehicle_type?: string | null;
  equipment_type?: string | null;
  deactivated_at?: string | null;
  oos_since?: string | null;
  days_oos?: number | null;
  oos_reason?: string | null;
  oos_location?: string | null;
  estimated_completion_date?: string | null;
  work_order_id?: string | null;
  work_order_display_id?: string | null;
  assigned_driver_id?: string | null;
  assigned_driver_name?: string | null;
  irp_expiration?: string | null;
  us_insurance_expiration?: string | null;
  mx_insurance_expiration?: string | null;
};

export function buildReeferSummary(row: Record<string, unknown>): string | null {
  const equipmentType = String(row.equipment_type ?? "");
  if (equipmentType !== "Reefer") return null;
  const year = row.reefer_year != null ? String(row.reefer_year) : "";
  const brand = row.reefer_brand != null ? String(row.reefer_brand).trim() : "";
  if (year && brand) return `Reefer (${year} ${brand})`;
  if (brand) return `Reefer (${brand})`;
  if (year) return `Reefer (${year})`;
  return "Reefer";
}

export function displayTypeForTrailer(row: Record<string, unknown>): string {
  const equipmentType = String(row.equipment_type ?? "").trim();
  if (equipmentType === "Reefer") {
    return buildReeferSummary(row) ?? "Reefer";
  }
  if (!equipmentType) return "Trailer";
  if (equipmentType === "DryVan") return "Dry Van";
  return equipmentType;
}

function tenantFilter(values: unknown[], operatingCompanyId: string): string {
  values.push(operatingCompanyId);
  const idx = values.length;
  return `(owner_company_id = $${idx} OR currently_leased_to_company_id = $${idx})`;
}

export async function fetchUnifiedFleetList(
  client: PgClient,
  options: {
    // Entity scope (USMCA cross-entity leak fix): REQUIRED. This service blends mdata.units +
    // mdata.equipment, neither entity-scoped by RLS — callers must resolve and pass the operating
    // company so the owner/leased tenant predicate is ALWAYS applied to both halves.
    operating_company_id: string;
    status?: string;
    search?: string;
    type?: FleetTypeFilter;
    /** When true, also return soft-deleted (deactivated_at IS NOT NULL) units so they
     *  can be viewed and reactivated. Widens the fetch ONLY — tenant/RLS scope unchanged. */
    include_inactive?: boolean;
    limit: number;
    offset: number;
  }
): Promise<{ rows: UnifiedFleetRow[]; total: number }> {
  const truckValues: unknown[] = [];
  // FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP: is_sample_data rows (e.g. "CODEX-AUDIT-UNIT-...") are
  // not always caught by the name-pattern predicate above — mdata.units-only, mdata.equipment has
  // no such column.
  const truckFilters: string[] = [excludeDemoPhantomSql("unit_number"), excludeSampleDataSql()];
  if (!options.include_inactive) truckFilters.push("deactivated_at IS NULL");
  if (options.type) {
    truckFilters.push(truckTypeSqlFilter(options.type));
  }
  if (options.status) {
    truckValues.push(options.status);
    truckFilters.push(`status = $${truckValues.length}`);
  }
  if (options.search) {
    truckValues.push(`%${options.search}%`);
    const idx = truckValues.length;
    truckFilters.push(
      `(unit_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`
    );
  }
  // ALWAYS bind the tenant predicate (operating_company_id is required) — never blend entities.
  truckFilters.push(tenantFilter(truckValues, options.operating_company_id));
  const truckCompanyParamIndex = truckValues.length;

  const trailerValues: unknown[] = [];
  // FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (equipment half, migration 202613140000): mdata.equipment
  // now has is_sample_data like mdata.units — exclude the same way.
  const trailerFilters: string[] = [excludeDemoPhantomSql("equipment_number"), excludeSampleDataSql()];
  if (!options.include_inactive) trailerFilters.push("deactivated_at IS NULL");
  if (options.type) {
    trailerFilters.push(trailerTypeSqlFilter(options.type, trailerValues));
  }
  if (options.status) {
    trailerValues.push(options.status);
    trailerFilters.push(`status = $${trailerValues.length}`);
  }
  if (options.search) {
    trailerValues.push(`%${options.search}%`);
    const idx = trailerValues.length;
    trailerFilters.push(
      `(equipment_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`
    );
  }
  // ALWAYS bind the tenant predicate (operating_company_id is required) — never blend entities.
  trailerFilters.push(tenantFilter(trailerValues, options.operating_company_id));

  const truckRes = await client.query(
    `
      SELECT
        id,
        unit_number,
        vin,
        make,
        model,
        year,
        status,
        is_oos,
        oos_since,
        CASE
          WHEN oos_since IS NULL THEN NULL
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - oos_since)) / 86400)
        END AS days_oos,
        oos_reason,
        oos_location,
        oos_detail.estimated_completion_date,
        oos_detail.work_order_id,
        oos_detail.work_order_display_id,
        assigned_driver_id,
        mdata.resolve_driver_label_same_company(assigned_driver_id, $${truckCompanyParamIndex}) AS assigned_driver_name,
        irp_expiration,
        us_insurance_expiration,
        mx_insurance_expiration,
        vehicle_type,
        owner_company_id,
        currently_leased_to_company_id,
        deactivated_at
      FROM mdata.units
      LEFT JOIN LATERAL (
        SELECT
          estimate.estimated_completion_date::text AS estimated_completion_date,
          estimate.trigger_wo_id::text AS work_order_id,
          work_order.display_id AS work_order_display_id
        FROM maintenance.severe_repair_estimates estimate
        LEFT JOIN maintenance.work_orders work_order
          ON work_order.id = estimate.trigger_wo_id
         AND work_order.operating_company_id = estimate.operating_company_id
         AND work_order.voided_at IS NULL
        WHERE estimate.unit_id = mdata.units.id
          AND estimate.operating_company_id = $${truckCompanyParamIndex}
          AND estimate.estimate_status IN ('open', 'awaiting_approval', 'approved')
        ORDER BY estimate.estimated_completion_date ASC NULLS LAST, estimate.refreshed_at DESC
        LIMIT 1
      ) oos_detail ON TRUE
      WHERE ${truckFilters.join(" AND ")}
      ORDER BY unit_number ASC NULLS LAST
    `,
    truckValues
  );

  const trailerRes = await client.query(
    `
      SELECT
        id,
        equipment_number,
        vin,
        make,
        model,
        year,
        status,
        equipment_type,
        reefer_year,
        reefer_brand,
        NULL::uuid AS assigned_driver_id,
        NULL::text AS assigned_driver_name,
        NULL::date AS irp_expiration,
        us_insurance_expiration,
        mx_insurance_expiration,
        owner_company_id,
        currently_leased_to_company_id,
        deactivated_at
      FROM mdata.equipment
      WHERE ${trailerFilters.join(" AND ")}
      ORDER BY equipment_number ASC NULLS LAST
    `,
    trailerValues
  );

  const operatingCompanyId = options.operating_company_id ?? null;
  const trucks: UnifiedFleetRow[] = truckRes.rows.map((row) => ({
    id: String(row.id),
    kind: "truck" as const,
    unit_number: String(row.unit_number ?? row.id),
    vin: row.vin != null ? String(row.vin) : null,
    year: row.year != null ? Number(row.year) : null,
    make: row.make != null ? String(row.make) : null,
    model: row.model != null ? String(row.model) : null,
    type: "Truck",
    status: String(row.status ?? ""),
    reefer_summary: null,
    operating_company_id: operatingCompanyId,
    is_oos: Boolean(row.is_oos),
    vehicle_type: row.vehicle_type != null ? String(row.vehicle_type) : null,
    deactivated_at: row.deactivated_at != null ? String(row.deactivated_at) : null,
    oos_since: row.oos_since != null ? String(row.oos_since) : null,
    days_oos: row.days_oos != null ? Number(row.days_oos) : null,
    oos_reason: row.oos_reason != null ? String(row.oos_reason) : null,
    oos_location: row.oos_location != null ? String(row.oos_location) : null,
    estimated_completion_date: row.estimated_completion_date != null ? String(row.estimated_completion_date) : null,
    work_order_id: row.work_order_id != null ? String(row.work_order_id) : null,
    work_order_display_id: row.work_order_display_id != null ? String(row.work_order_display_id) : null,
    assigned_driver_id: row.assigned_driver_id != null ? String(row.assigned_driver_id) : null,
    assigned_driver_name: row.assigned_driver_name != null ? String(row.assigned_driver_name) : null,
    irp_expiration: row.irp_expiration != null ? String(row.irp_expiration) : null,
    us_insurance_expiration: row.us_insurance_expiration != null ? String(row.us_insurance_expiration) : null,
    mx_insurance_expiration: row.mx_insurance_expiration != null ? String(row.mx_insurance_expiration) : null,
  }));

  const trailers: UnifiedFleetRow[] = trailerRes.rows.map((row) => ({
    id: String(row.id),
    kind: "trailer" as const,
    unit_number: String(row.equipment_number ?? row.id),
    vin: row.vin != null ? String(row.vin) : null,
    year: row.year != null ? Number(row.year) : null,
    make: row.make != null ? String(row.make) : null,
    model: row.model != null ? String(row.model) : null,
    type: displayTypeForTrailer(row),
    status: String(row.status ?? ""),
    reefer_summary: buildReeferSummary(row),
    operating_company_id: operatingCompanyId,
    equipment_type: row.equipment_type != null ? String(row.equipment_type) : null,
    deactivated_at: row.deactivated_at != null ? String(row.deactivated_at) : null,
    assigned_driver_id: null,
    assigned_driver_name: null,
    irp_expiration: null,
    us_insurance_expiration: row.us_insurance_expiration != null ? String(row.us_insurance_expiration) : null,
    mx_insurance_expiration: row.mx_insurance_expiration != null ? String(row.mx_insurance_expiration) : null,
  }));

  const merged = [...trucks, ...trailers].sort((a, b) =>
    a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
  );
  // total = the FULL merged fleet count (before paging) so the UI pages through every truck+trailer,
  // not just the current page (the unified/trailers path previously returned no total → UI showed "of 50").
  return { rows: merged.slice(options.offset, options.offset + options.limit), total: merged.length };
}
