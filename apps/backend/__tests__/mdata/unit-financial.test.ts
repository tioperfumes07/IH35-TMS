import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("unit-financial.service", () => {
  it("reuses profit-per-truck join pattern", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "apps/backend/src/mdata/unit-financial.service.ts"),
      "utf8"
    );
    assert.ok(src.includes("load_scope"));
    assert.ok(src.includes("assigned_unit_id"));
    assert.ok(src.includes("driver_finance.driver_bills"));
    assert.ok(src.includes("fuel.fuel_transactions"));
  });
});
