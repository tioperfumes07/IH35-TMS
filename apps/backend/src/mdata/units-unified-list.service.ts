import type { FleetTypeFilter } from "./fleet-type-filter.js";
import { trailerTypeSqlFilter, truckTypeSqlFilter } from "./fleet-type-filter.js";

type PgClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Demo/phantom hygiene (E1): never surface seeded TEST/DEMO rows or the phantom
 * `SAM-*` Samsara dual-write rows in fleet dropdowns or the Fleet roster. Static
 * literal patterns (no user input) so they're safe to inline.
 */
function excludeDemoPhantomSql(col: string): string {
  return `(${col} NOT ILIKE 'SAM-%' AND ${col} NOT ILIKE 'TEST%' AND ${col} NOT ILIKE '%DEMO%')`;
}

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
    operating_company_id?: string;
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
  const truckFilters: string[] = [excludeDemoPhantomSql("unit_number")];
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
  if (options.operating_company_id) {
    truckFilters.push(tenantFilter(truckValues, options.operating_company_id));
  }

  const trailerValues: unknown[] = [];
  const trailerFilters: string[] = [excludeDemoPhantomSql("equipment_number")];
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
  if (options.operating_company_id) {
    trailerFilters.push(tenantFilter(trailerValues, options.operating_company_id));
  }

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
        vehicle_type,
        owner_company_id,
        currently_leased_to_company_id,
        deactivated_at
      FROM mdata.units
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
  }));

  const merged = [...trucks, ...trailers].sort((a, b) =>
    a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
  );
  // total = the FULL merged fleet count (before paging) so the UI pages through every truck+trailer,
  // not just the current page (the unified/trailers path previously returned no total → UI showed "of 50").
  return { rows: merged.slice(options.offset, options.offset + options.limit), total: merged.length };
}
