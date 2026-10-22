/**
 * LEAD 443.231b — fail-old: available units are unit-centric; Truck Line and
 * units-without-load share unitCurrentDriverSql (never assigned_driver_id).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  unitCurrentDriverSql,
  unitLastDeliveredDriverLateralSql,
  unitOpenVdaDriverLateralSql,
} from "../unit-current-driver.js";
import { groupTruckLineByUnit } from "../truck-line/group-by-unit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("unitCurrentDriverSql (443.231b)", () => {
  it("prefers open VDA then last-delivered primary (never assigned_driver_id)", () => {
    const sql = unitCurrentDriverSql("u", "$1::uuid");
    expect(sql).toContain("vehicle_driver_assignments");
    expect(sql).toContain("unit_last_drv");
    expect(sql).toContain("COALESCE(unit_vda.driver_id, unit_last_drv.driver_id)");
    expect(sql).toContain("driver_company_authorizations"); // assignmentInCompanySql pin
    expect(sql).not.toMatch(/assigned_driver_id/);
    expect(unitOpenVdaDriverLateralSql("u", "$1::uuid")).toContain("ended_at IS NULL");
    expect(unitLastDeliveredDriverLateralSql("u", "$1::uuid")).toContain("assigned_primary_driver_id");
  });

  it("Truck Line AVAILABLE and units-without-load both call unitCurrentDriverSql", () => {
    const truckLine = read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
    const loads = read("apps/backend/src/dispatch/loads.routes.ts");
    expect(truckLine).toMatch(/\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/);
    expect(loads).toMatch(/\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/);
    expect(truckLine).toMatch(/FROM mdata\.units u/);
    expect(truckLine).not.toMatch(/FROM qualifying q/);
    // Same free-unit gate export on both surfaces.
    expect(loads).toMatch(/WHERE \$\{UNIT_IN_SERVICE_SQL\}/);
    expect(truckLine).toMatch(/WHERE \$\{UNIT_IN_SERVICE_SQL\}/);
  });

  it("fail-old: two drivers for one unit collapse to one available row (first wins)", () => {
    // Simulates the pre-443.231b driver-centric bug (T152 × 2). Grouper + route throw are the
    // defense; the query itself is unit-centric so this input should not reach production.
    const groups = groupTruckLineByUnit(
      [],
      [
        { unit_id: "19d29860", unit_number: "T152", row: { driver_id: "d-13538", kind: "available" } },
        { unit_id: "19d29860", unit_number: "T152", row: { driver_id: "d-13512", kind: "available" } },
      ]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.legs).toHaveLength(1);
    expect((groups[0]!.legs[0] as { driver_id: string }).driver_id).toBe("d-13538");
  });

  it("route fail-closed marker for duplicate available unit_id is present", () => {
    const truckLine = read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
    expect(truckLine).toContain("truck_line_available_duplicate_unit");
  });
});
