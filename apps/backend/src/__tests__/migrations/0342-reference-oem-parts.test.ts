import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(repoRoot, "db/migrations/0342_reference_oem_parts.sql");

describe("0342_reference_oem_parts migration", () => {
  it("creates reference.oem_parts with archive column, indexes, and DOWN section", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/reference\.oem_parts/);
    expect(sql).toMatch(/archived_at\s+timestamptz/);
    expect(sql).toMatch(/UNIQUE NULLS NOT DISTINCT \(brand, oem_part_number\)/);
    expect(sql).toMatch(/idx_oem_parts_brand_category_active/);
    expect(sql).toMatch(/idx_oem_parts_part_name_lower_active/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS reference\.oem_parts/);
  });
});
