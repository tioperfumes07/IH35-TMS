import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// INV-1: guard the migration that adds the REAL, persisted SKU + category + notes columns to
// maintenance.parts_inventory (the create route previously returned id::text as a fake SKU and
// dropped category/notes). Idempotent, guarded, additive-only.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/202607050850_inv1_parts_real_sku_category_notes.sql"
);

describe("202607050850 INV-1 parts real SKU + category/notes migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds part_number, category and notes columns idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS part_number text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS category\s+text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS notes\s+text/);
  });

  it("targets the canonical maintenance.parts_inventory table behind a to_regclass guard", () => {
    expect(sql).toMatch(/maintenance\.parts_inventory/);
    expect(sql).toMatch(/to_regclass\('maintenance\.parts_inventory'\)/);
  });

  it("backfills legacy rows with a stable derived SKU (only where missing)", () => {
    expect(sql).toMatch(/SET part_number = 'PART-'/);
    expect(sql).toMatch(/WHERE part_number IS NULL/);
  });

  it("is additive-only — never drops the table or columns", () => {
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it("grants runtime role access to the new columns", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON maintenance\.parts_inventory TO ih35_app/);
  });
});
