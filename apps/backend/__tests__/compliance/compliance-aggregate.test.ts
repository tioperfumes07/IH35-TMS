import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  computeComplianceSeverity,
  daysUntilExpiration,
  rollupComplianceOwners,
  severityToOwnerStatus,
} from "../../src/compliance/compliance-aggregate.service.js";
import type { ComplianceCredential } from "../../src/compliance/compliance-aggregate.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compliance aggregate", () => {
  it("queries expected sources", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/compliance-aggregate.service.ts"), "utf8");
    assert.match(src, /buildComplianceCredentials/);
    assert.match(src, /mdata\.units/);
    assert.match(src, /mdata\.equipment_plates/);
    assert.match(src, /passport_expires_at/);
  });

  it("maps severity to owner status flags", () => {
    assert.equal(severityToOwnerStatus("red"), "expired");
    assert.equal(severityToOwnerStatus("yellow"), "expiring_soon");
    assert.equal(severityToOwnerStatus("green"), "compliant");
  });

  it("rolls up drivers and trucks by worst credential", () => {
    const rows: ComplianceCredential[] = [
      {
        credential_id: "driver:d1:cdl:2026-01-01",
        type: "cdl",
        owner_type: "driver",
        owner_id: "d1",
        owner_name: "Jane Doe",
        label: "CDL",
        expiration_date: "2026-01-01",
        days_until_expiration: 5,
        severity: "red",
        action_link: "/drivers/d1/profile",
      },
      {
        credential_id: "driver:d1:medical:2026-12-01",
        type: "medical_card",
        owner_type: "driver",
        owner_id: "d1",
        owner_name: "Jane Doe",
        label: "Medical Card",
        expiration_date: "2026-12-01",
        days_until_expiration: 180,
        severity: "green",
        action_link: "/drivers/d1/profile",
      },
      {
        credential_id: "unit:u1:irp:2026-02-01",
        type: "irp",
        owner_type: "unit",
        owner_id: "u1",
        owner_name: "101",
        label: "IRP Registration",
        expiration_date: "2026-02-01",
        days_until_expiration: 20,
        severity: "yellow",
        action_link: "/fleet/units/u1",
      },
    ];
    const drivers = rollupComplianceOwners(rows, "driver");
    assert.equal(drivers.length, 1);
    assert.equal(drivers[0]?.status, "expired");
    const trucks = rollupComplianceOwners(rows, "unit");
    assert.equal(trucks.length, 1);
    assert.equal(trucks[0]?.status, "expiring_soon");
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
