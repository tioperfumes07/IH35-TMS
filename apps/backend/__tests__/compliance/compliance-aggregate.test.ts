import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { computeComplianceSeverity, daysUntilExpiration } from "../../src/compliance/compliance-aggregate.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compliance aggregate", () => {
  it("queries expected sources", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/compliance-aggregate.service.ts"), "utf8");
    assert.match(src, /buildComplianceCredentials/);
    assert.match(src, /mdata\.units/);
    assert.match(src, /mdata\.equipment_plates/);
  });

  it("computes severity thresholds at boundaries", () => {
    assert.equal(computeComplianceSeverity(6), "red");
    assert.equal(computeComplianceSeverity(7), "yellow");
    assert.equal(computeComplianceSeverity(30), "yellow");
    assert.equal(computeComplianceSeverity(31), "green");
    assert.equal(computeComplianceSeverity(-1), "red");
  });

  it("computes days until expiration", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    const iso = future.toISOString().slice(0, 10);
    const days = daysUntilExpiration(iso);
    assert.ok(days !== null && days >= 9 && days <= 11);
  });
});
