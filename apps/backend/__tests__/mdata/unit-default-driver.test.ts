import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../../../../db/migrations/0295_vehicle_profile_part1.sql"), "utf8");

describe("0295 vehicle profile migration", () => {
  it("extends telematics assignments and adds unit_plates", () => {
    assert.match(migration, /ADD VALUE IF NOT EXISTS 'Damaged'/);
    assert.match(migration, /mdata\.unit_plates/);
    assert.match(migration, /is_default boolean/);
    assert.match(migration, /uq_vda_one_default_per_unit/);
    assert.ok(!migration.includes("log_unit_status_change"));
  });
});
