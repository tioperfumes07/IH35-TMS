import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getFinancialPeriodBounds } from "../../src/mdata/unit-financial.service.js";

describe("vehicle profile part 2", () => {
  it("migration defines equipment reefer columns and unit_photos", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "db/migrations/0296_vehicle_profile_part2.sql"),
      "utf8"
    );
    assert.match(sql, /reefer_brand/);
    assert.match(sql, /mdata\.unit_photos/);
    assert.equal(sql.includes("unit_documents"), false);
  });

  it("financial period bounds for YTD starts Jan 1", () => {
    const { start } = getFinancialPeriodBounds("YTD");
    assert.match(start, /^\d{4}-01-01$/);
  });
});
