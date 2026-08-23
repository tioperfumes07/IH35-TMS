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

    it("INV-CAT-01: create requires category from PART_INVENTORY_CATEGORY_VALUES (not optional blank)", () => {
      const createSchema = source.match(/const createSchema = z\.object\(\{[\s\S]*?\}\);/);
      expect(createSchema).toBeTruthy();
      expect(createSchema![0]).toMatch(/category:\s*partCategorySchema/);
      expect(source).toMatch(/PART_INVENTORY_CATEGORY_VALUES/);
    });

    it("generates a stable PART- SKU when the user leaves it blank", () => {
      expect(source).toMatch(/'PART-' \|\| upper\(substr\(replace\(gen_random_uuid\(\)::text/);
    });

    it("lets the update handler edit part_number, category and notes", () => {
      expect(source).toMatch(/add\("part_number"/);
      expect(source).toMatch(/add\("category"/);
      expect(source).toMatch(/add\("notes"/);
    });

    it("persists reorder_threshold on create, list, update, and CSV import", () => {
      expect(source).toMatch(/pi\.reorder_threshold/);
      expect(source).toMatch(/add\("reorder_threshold"/);
      expect(source).toMatch(/reorder_threshold: newRow\.reorder_threshold/);
      expect(source).not.toMatch(/0::int AS reorder_threshold/);
      expect(source).not.toMatch(/reorder_threshold:\s*0,/);
      expect(source.match(/INSERT INTO maintenance\.parts_inventory[\s\S]*?reorder_threshold/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("INV-LINK-01: persists vendor_id on create, read and update", () => {
      expect(source).toMatch(/vendor_id:\s*z\.string\(\)\.uuid\(\)/);
      const insert = source.match(/INSERT INTO maintenance\.parts_inventory[\s\S]*?RETURNING/);
      expect(insert![0]).toMatch(/vendor_id/);
      expect(source).toMatch(/vendor_id::text AS vendor_id/);
      expect(source).toMatch(/add\("vendor_id"/);
      expect(source).not.toMatch(/NULL::text AS vendor_default/);
    });

    it("validates the preferred vendor inside the operating company before create or update", () => {
      expect(source).toMatch(/FROM mdata\.vendors[\s\S]*operating_company_id = \$2::uuid[\s\S]*deactivated_at IS NULL/);
      expect(source.match(/vendorBelongsToCompany\(/g)?.length).toBeGreaterThanOrEqual(3);
      expect(source).toMatch(/linked_entity_not_in_operating_company/);
    });

    it("supports an exact tenant-scoped vendor reverse query", () => {
      expect(source).toMatch(/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
      // Alias pi required for same-opco vendor_name LEFT JOIN on the list path.
      expect(source).toMatch(/filters\.push\(`pi\.vendor_id = \$\$\{values\.length\}::uuid`\)/);
      // The bare `v.vendor_name AS vendor_name` alias was wrapped in a COALESCE historical-label
      // fallback (verify-inventory-vendor-historical-label-resolver) so a deactivated/renamed
      // vendor still resolves a label instead of going blank -- match the current, guarded shape.
      expect(source).toMatch(/COALESCE\(v\.vendor_name, mdata\.resolve_vendor_label_same_company\([^)]*\)\) AS vendor_name/);
      expect(source).toMatch(/LEFT JOIN mdata\.vendors v/);
    });

    it("tenant-scopes the update lookup and write independently of RLS", () => {
      expect(source).toMatch(/SELECT \* FROM maintenance\.parts_inventory WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/);
      expect(source).toMatch(/WHERE id = \$\$\{values\.length - 1\}::uuid AND operating_company_id = \$\$\{values\.length\}::uuid/);
    });
  });
});
