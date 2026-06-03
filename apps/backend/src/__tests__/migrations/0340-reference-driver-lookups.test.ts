import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(repoRoot, "db/migrations/0340_reference_driver_lookups.sql");

describe("0340_reference_driver_lookups migration", () => {
  it("creates five reference driver lookup tables with archive column and canonical seeds", () => {
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
    expect(sql).toMatch(/CDL-A/);
    expect(sql).toMatch(/EXPIRING-30/);
    expect(sql).toMatch(/REHIRE-ELIGIBLE/);
    expect(sql).toMatch(/DEPRECATED 2026-06-03/);
  });
});
