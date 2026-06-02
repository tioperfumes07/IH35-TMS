import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../../../../db/migrations/0302_driver_profile_part2.sql"), "utf8");
const aggregate = fs.readFileSync(path.join(here, "../../src/mdata/driver-aggregate.service.ts"), "utf8");

describe("0302 driver profile part 2", () => {
  it("adds border credential columns on mdata.drivers", () => {
    assert.match(migration, /mdata\.drivers/);
    assert.match(migration, /fast_card_number/);
    assert.match(migration, /twic_card_number/);
    assert.match(migration, /visa_b1_status/);
  });
});

describe("driver aggregate part 2", () => {
  it("builds performance settlements training border documents sections", () => {
    assert.match(aggregate, /performance_scorecard/);
    assert.match(aggregate, /safety\.harsh_events/);
    assert.match(aggregate, /payroll\.driver_settlements/);
    assert.match(aggregate, /safety\.training_records/);
    assert.match(aggregate, /border_credentials/);
    assert.match(aggregate, /entity_type = 'driver'/);
  });
});
