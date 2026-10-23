import { apiRequest } from "../../../api/client";

export type FleetHealthRow = {
  unit_id: string; unit_number: string; make: string | null; model: string | null; year: number | null;
  odometer_mi: number | null; telemetry_at: string | null; formatted_location: string | null;
  telemetry_city: string | null; telemetry_state: string | null; speed_mph: number | null;
  pm_schedule_id: string | null; pm_interval: number | null; miles_left: number | null;
  state: "ok" | "soon" | "overdue" | "shop" | "none";
  /** LEAD 443.281 row 108 — the unit has a miles PM clock but no last-PM odometer / next-due on file (never guessed). */
  pm_baseline_absent?: boolean;
  body_style?: "classic" | "sloped" | "aero";
};
type HealthResponse = { units: FleetHealthRow[]; kpi: { total: number } };

export async function readFleetHealth(companyId: string): Promise<HealthResponse> {
  const units: FleetHealthRow[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  let page: HealthResponse;
  do {
    page = await apiRequest<HealthResponse>(`/api/v1/maintenance/fleet-health?operating_company_id=${encodeURIComponent(companyId)}&limit=500&offset=${units.length}`);
    if (!Number.isInteger(page.kpi.total) || page.kpi.total < 0) throw new Error("Fleet health returned an invalid total.");
    if (total != null && total !== page.kpi.total) throw new Error("Fleet roster changed during pagination. Retry.");
    total = page.kpi.total;
    for (const row of page.units) {
      if (seen.has(row.unit_id)) throw new Error("Fleet health returned a repeated unit. Retry.");
      seen.add(row.unit_id);
      units.push(row);
    }
    if (page.units.length === 0 && units.length < total) throw new Error("Fleet health returned an incomplete roster. Retry.");
  } while (units.length < total);
  if (units.length !== total) throw new Error("Fleet health rows do not agree with its total. Retry.");
  return { ...page, units };
}
