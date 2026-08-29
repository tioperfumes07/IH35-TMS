import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../loads.routes.ts"), "utf8");

// A9 (2026-07-05, read-only, non-financial): the dispatch board list endpoint
// (GET /api/v1/dispatch/loads) previously joined `mdata.units tr ON tr.id =
// l.assigned_secondary_driver_id` for trailer_number — comparing a unit id to a
// DRIVER id, which never matches, so trailer_number was silently always NULL.
// mdata.loads has no trailer_id column (see [[loads-no-trailer-id-column]]); the
// only real trailer<->load link is dispatch.load_assignment_history.new_trailer_id
// -> mdata.equipment. Guard the real join so this can't regress back to the
// driver-id/unit-id mismatch.
describe("dispatch/loads.routes — trailer read-model (A9)", () => {
  it("resolves trailer_number/trailer_equipment_type from load_assignment_history -> mdata.equipment, not a driver-id mismatch", () => {
    expect(routes).toContain("dispatch.load_assignment_history lah");
    expect(routes).toContain("JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id");
    expect(routes).toContain("WHERE lah.load_id = l.id AND lah.new_trailer_id IS NOT NULL");
    expect(routes).toContain("ORDER BY lah.assigned_at DESC");
    expect(routes).toContain("tr.equipment_number AS trailer_number");
    expect(routes).toContain("tr.equipment_type AS trailer_equipment_type");
    // Regression guard: the broken join (unit.id = driver.id) must never come back.
    expect(routes).not.toContain("mdata.units tr ON tr.id = l.assigned_secondary_driver_id");
  });

  it("uses the same assignment-history trailer link for the load detail response", () => {
    const detailStart = routes.indexOf('app.get("/api/v1/dispatch/loads/:id"');
    const detailEnd = routes.indexOf('app.post("/api/v1/dispatch/loads/:id/distribute-instructions"', detailStart);
    const detailRoute = routes.slice(detailStart, detailEnd);
    expect(detailRoute).toContain("tr.id AS trailer_id");
    expect(detailRoute).toContain("tr.equipment_number AS trailer_number");
    expect(detailRoute).toContain("tr.equipment_type AS trailer_equipment_type");
    expect(detailRoute).toContain("lah.operating_company_id = l.operating_company_id");
    expect(detailRoute).not.toContain("NULL::text AS trailer_number");
  });

  it("reads Book Load customer references from the canonical entity-scoped load row", () => {
    const detailStart = routes.indexOf('app.get("/api/v1/dispatch/loads/:id"');
    const detailEnd = routes.indexOf('app.post("/api/v1/dispatch/loads/:id/distribute-instructions"', detailStart);
    const detailRoute = routes.slice(detailStart, detailEnd);

    expect(detailRoute).toContain("ml.customer_wo_number AS customer_wo_number");
    expect(detailRoute).toContain("ml.pickup_number AS pickup_number");
    expect(detailRoute).toContain("LEFT JOIN mdata.loads ml ON ml.id = l.id");
    expect(detailRoute).toContain("ml.operating_company_id = l.operating_company_id");
  });
});
