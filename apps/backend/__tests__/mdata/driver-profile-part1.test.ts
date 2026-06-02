import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../../../../db/migrations/0301_driver_profile_part1.sql"), "utf8");
const driverRoutes = fs.readFileSync(path.join(here, "../../src/mdata/driver-default-truck.routes.ts"), "utf8");
const aggregate = fs.readFileSync(path.join(here, "../../src/mdata/driver-aggregate.service.ts"), "utf8");

describe("0301 driver profile part 1", () => {
  it("adds endorsement and identity columns on mdata.drivers", () => {
    assert.match(migration, /mdata\.drivers/);
    assert.match(migration, /endorsement_h/);
    assert.match(migration, /employment_status/);
    assert.match(migration, /photo_url/);
  });
});

describe("driver default truck routes", () => {
  it("exposes symmetric endpoints", () => {
    assert.match(driverRoutes, /default-truck/);
    assert.match(driverRoutes, /clear-default-truck/);
    assert.match(driverRoutes, /vehicle_driver_assignments/);
  });
});

describe("driver aggregate", () => {
  it("builds license medical drug hos assignment sections", () => {
    assert.match(aggregate, /buildDriverAggregate/);
    assert.match(aggregate, /safety\.medical_cards/);
    assert.match(aggregate, /safety\.drug_test/);
    assert.match(aggregate, /getCurrentClocks/);
    assert.match(aggregate, /default_truck/);
  });
});
