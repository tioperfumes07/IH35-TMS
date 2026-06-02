import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
describe("equipment aggregate", () => {
  it("builds trailer profile sections", () => {
    const src = fs.readFileSync(path.join(here, "../../src/mdata/equipment-aggregate.service.ts"), "utf8");
    assert.match(src, /buildEquipmentAggregate/);
    assert.match(src, /equipment_plates/);
    assert.match(src, /entity_type = 'equipment'/);
  });
});
