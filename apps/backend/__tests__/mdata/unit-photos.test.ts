import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("unit-photos routes", () => {
  it("registers photos CRUD paths", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "apps/backend/src/mdata/unit-photos.routes.ts"),
      "utf8"
    );
    assert.ok(src.includes("/api/v1/mdata/units/:id/photos"));
    assert.ok(src.includes("mdata.unit_photos"));
    assert.ok(src.includes("appendCrudAudit"));
  });
});
