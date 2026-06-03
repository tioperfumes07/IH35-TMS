import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(repoRoot, "db/migrations/0343_drivers_reference_fk_wire.sql");

describe("0343_drivers_reference_fk_wire migration", () => {
  it("adds FK columns, junction tables, sync triggers, and backfill", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/license_class_id uuid/);
    expect(sql).toMatch(/driver_employment_status_id uuid/);
    expect(sql).toMatch(/medical_card_status_id uuid/);
    expect(sql).toMatch(/REFERENCES reference\.license_classes/);
    expect(sql).toMatch(/REFERENCES reference\.employment_statuses/);
    expect(sql).toMatch(/REFERENCES reference\.medical_card_statuses/);
    expect(sql).toMatch(/mdata\.driver_cdl_endorsements/);
    expect(sql).toMatch(/mdata\.driver_cdl_restrictions/);
    expect(sql).toMatch(/sync_driver_reference_fks_row/);
    expect(sql).toMatch(/sync_driver_endorsement_links/);
    expect(sql).toMatch(/sync_driver_restriction_links/);
    expect(sql).toMatch(/Legacy inline CDL class/);
  });
});
