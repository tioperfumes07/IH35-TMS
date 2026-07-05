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

  // INV-1: the SKU must be a REAL, persisted column — not the fake id::text — and category + notes
  // must be persisted (they were collected by the create drawer but silently dropped).
  describe("INV-1 real SKU + persisted category/notes", () => {
    it("persists part_number, category and notes on create", () => {
      const insert = source.match(/INSERT INTO maintenance\.parts_inventory[\s\S]*?RETURNING/);
      expect(insert, "create INSERT not found").toBeTruthy();
      expect(insert![0]).toMatch(/part_number/);
      expect(insert![0]).toMatch(/category/);
      expect(insert![0]).toMatch(/notes/);
    });

    it("no longer returns id::text as the SKU on create", () => {
      // The old fake SKU was: RETURNING id, id::text AS part_number ...
      expect(source).not.toMatch(/id::text AS part_number/);
    });

    it("accepts category + notes in the create schema (not dropped)", () => {
      const createSchema = source.match(/const createSchema = z\.object\(\{[\s\S]*?\}\);/);
      expect(createSchema).toBeTruthy();
      expect(createSchema![0]).toMatch(/category:/);
      expect(createSchema![0]).toMatch(/notes:/);
    });

    it("generates a stable PART- SKU when the user leaves it blank", () => {
      expect(source).toMatch(/'PART-' \|\| upper\(substr\(replace\(gen_random_uuid\(\)::text/);
    });

    it("lets the update handler edit part_number, category and notes", () => {
      expect(source).toMatch(/add\("part_number"/);
      expect(source).toMatch(/add\("category"/);
      expect(source).toMatch(/add\("notes"/);
    });
  });
});
