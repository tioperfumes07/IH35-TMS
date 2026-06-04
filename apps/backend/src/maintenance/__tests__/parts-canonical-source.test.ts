import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesPath = path.join(here, "../parts.routes.ts");

describe("maintenance parts canonical source (B23)", () => {
  const source = fs.readFileSync(routesPath, "utf8");

  it("lists parts from maintenance.parts_inventory", () => {
    expect(source).toMatch(/FROM maintenance\.parts_inventory/);
  });

  it("computes KPIs from maintenance.parts_inventory", () => {
    expect(source).toMatch(/FROM maintenance\.parts_inventory[\s\S]*total_parts/);
  });

  it("creates rows in maintenance.parts_inventory", () => {
    expect(source).toMatch(/INSERT INTO maintenance\.parts_inventory/);
  });

  it("updates rows in maintenance.parts_inventory", () => {
    expect(source).toMatch(/UPDATE maintenance\.parts_inventory/);
  });

  it("voids rows in maintenance.parts_inventory", () => {
    expect(source).toMatch(/maintenance\.parts\.voided/);
    expect(source).toMatch(/UPDATE maintenance\.parts_inventory SET part_description = CONCAT\('\[VOID\] '/);
  });

  it("does not query legacy maint.part or catalogs.parts", () => {
    expect(source).not.toMatch(/FROM maint\.part/);
    expect(source).not.toMatch(/FROM catalogs\.parts/);
  });
});
