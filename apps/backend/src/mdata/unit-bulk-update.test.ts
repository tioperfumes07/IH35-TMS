import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "unit-bulk-update.routes.ts"), "utf8");
const index = fs.readFileSync(path.join(here, "index.ts"), "utf8");

describe("unit bulk-update route", () => {
  it("exposes POST /api/v1/mdata/units/bulk-update and maps 5 UI statuses", () => {
    expect(routes).toMatch(/app\.post\("\/api\/v1\/mdata\/units\/bulk-update"/);
    expect(routes).toMatch(/Active: "InService"/);
    expect(routes).toMatch(/OOS: "OutOfService"/);
    expect(routes).toMatch(/Sold: "Sold"/);
    expect(routes).toMatch(/Transferred: "Transferred"/);
    expect(routes).toMatch(/Damaged: "Damaged"/);
  });

  it("scopes updates by operating_company_id tenant WHERE clause", () => {
    expect(routes).toMatch(/owner_company_id = \$2::uuid/);
    expect(routes).toMatch(/currently_leased_to_company_id = \$2::uuid/);
    expect(routes).toMatch(/operating_company_id tenant scope/);
  });

  it("rejects more than 100 unit_ids", () => {
    expect(routes).toMatch(/\.max\(100\)/);
    expect(routes).toMatch(/too_many_unit_ids/);
  });

  it("emits unit.bulk_update audit rows per affected unit", () => {
    expect(routes).toMatch(/unit\.bulk_update/);
    expect(routes).toMatch(/appendCrudAudit/);
    expect(index).toMatch(/registerUnitBulkUpdateRoutes/);
  });
});
