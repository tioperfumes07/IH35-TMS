import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "..", "work-orders.routes.ts"), "utf8");

/**
 * MAINT-DETAIL-UUID-LABEL: GET /api/v1/maintenance/work-orders/:id was `SELECT * FROM
 * maintenance.work_orders` with NO joins at all — every id-only FK on the row (unit_id, driver_id,
 * vendor_id/external_vendor_id, roadside_breakdown_load_id) had no accompanying display name, so
 * WorkOrderDetailPage's EntityLink label props (already wired in the JSX) always fell back to the
 * raw uuid. Fixed by joining the same tables/columns the list route and unit-aggregate service
 * already use for this exact purpose.
 */
describe("GET /api/v1/maintenance/work-orders/:id — driver/vendor/roadside-load name joins", () => {
  it("selects the detail row with unit_number, driver_name, resolved vendor FK/name, and roadside load number", () => {
    expect(routes).toMatch(/SELECT w\.\*, u\.unit_number,/);
    expect(routes).toMatch(
      /NULLIF\(TRIM\(COALESCE\(d\.first_name, ''\) \|\| ' ' \|\| COALESCE\(d\.last_name, ''\)\), ''\) AS driver_name/
    );
    expect(routes).toMatch(/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS resolved_vendor_id/);
    expect(routes).toMatch(/v\.vendor_name AS resolved_vendor_name/);
    expect(routes).toMatch(/rl\.load_number AS roadside_breakdown_load_number/);
  });

  it("joins mdata.drivers, mdata.vendors, and mdata.loads scoped to the work order's operating company", () => {
    expect(routes).toMatch(/LEFT JOIN mdata\.drivers d ON d\.id = w\.driver_id\s+AND \(\s+d\.operating_company_id = w\.operating_company_id\s+OR EXISTS \(\s+SELECT 1 FROM mdata\.driver_company_authorizations work_orders_detail_dca/);
    expect(routes).toMatch(/work_orders_detail_dca\.company_id = w\.operating_company_id/);
    expect(routes).toMatch(/work_orders_detail_dca\.is_authorized = true/);
    expect(routes).toMatch(/work_orders_detail_dca\.deactivated_at IS NULL/);
    expect(routes).toMatch(/LEFT JOIN mdata\.vendors v ON v\.id = COALESCE\(w\.external_vendor_id, w\.vendor_id\) AND v\.operating_company_id = w\.operating_company_id/);
    expect(routes).toMatch(/LEFT JOIN mdata\.loads rl ON rl\.id = w\.roadside_breakdown_load_id AND rl\.operating_company_id = w\.operating_company_id/);
  });

  it("still scopes the detail row itself to the requesting operating company", () => {
    expect(routes).toMatch(/WHERE w\.id = \$1 AND w\.operating_company_id = \$2::uuid LIMIT 1/);
  });
});
