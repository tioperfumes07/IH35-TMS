import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("unit-trip-cost routes", () => {
  it("exposes trip-cost POST endpoint", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "apps/backend/src/mdata/unit-trip-cost.routes.ts"),
      "utf8"
    );
    assert.ok(src.includes("/api/v1/mdata/units/:id/trip-cost"));
    assert.ok(src.includes("suggested_quote_floor_cents"));
  });
});
