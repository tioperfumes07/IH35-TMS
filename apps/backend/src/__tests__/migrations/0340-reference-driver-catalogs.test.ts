import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/0340_reference_driver_catalogs.sql");

describe("0340_reference_driver_catalogs migration", () => {
  it("creates five reference driver catalog tables with archive column", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    for (const table of [
      "license_classes",
      "cdl_endorsements",
      "cdl_restrictions",
      "medical_card_statuses",
      "employment_statuses",
    ]) {
      expect(sql).toMatch(new RegExp(`reference\\.${table}`));
      expect(sql).toMatch(/archived_at timestamptz/);
    }
  });
});
