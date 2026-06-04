import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "work-orders.routes.ts"), "utf8");
const migration = fs.readFileSync(
  path.resolve(here, "../../../../db/migrations/0358_work_orders_equipment_id.sql"),
  "utf8"
);

describe("maintenance work-orders routes — trailer equipment_id (B26)", () => {
  it("list query schema accepts equipment_id filter", () => {
    expect(routes).toMatch(/equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  });

  it("GET /api/v1/maintenance/work-orders scopes by equipment_id", () => {
    expect(routes).toMatch(/w\.equipment_id = \$\$\{values\.length\}/);
    expect(routes).toMatch(/app\.get\("\/api\/v1\/maintenance\/work-orders"/);
  });

  it("migration 0358 adds nullable equipment_id with backfill", () => {
    expect(migration).toMatch(/0358/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS equipment_id uuid/);
    expect(migration).toMatch(/fk_maintenance_work_orders_equipment/);
    expect(migration).toMatch(/HAVING COUNT\(e\.id\) = 1/);
  });

  it("create paths persist optional equipment_id on work orders", () => {
    expect(routes).toMatch(/equipment_id, driver_id, load_id, opened_at/);
    expect(routes).toMatch(/UPDATE maintenance\.work_orders SET equipment_id = \$2::uuid/);
  });
});
