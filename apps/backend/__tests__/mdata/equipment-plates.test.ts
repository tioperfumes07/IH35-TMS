import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
describe("equipment plates routes", () => {
  it("exposes CRUD under mdata equipment", () => {
    const src = fs.readFileSync(path.join(here, "../../src/mdata/equipment-plates.routes.ts"), "utf8");
    assert.match(src, /equipment_plates/);
    assert.match(src, /archive/);
  });
});
