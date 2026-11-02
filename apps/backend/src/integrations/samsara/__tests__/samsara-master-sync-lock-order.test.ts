/**
 * ROUND 7.18 — TELEMATICS-DEADLOCK-02 (CC-2 2026-11-02):
 * mdata.units deadlock: samsara-master-sync UPDATE touched vin/samsara_vehicle_id (UNIQUE columns)
 * unconditionally → always FOR UPDATE → conflicts with FOR KEY SHARE from concurrent FK checks
 * (auto_status_switch_worker, geofence_state_watcher INSERT → mdata.units).
 *
 * Fix (a): Phase 1 updates only non-unique columns (FOR NO KEY UPDATE — never conflicts with FK checks).
 *          Phase 2 updates UNIQUE columns only when they are currently empty (new linkage only).
 * Fix (b): vehicles are sorted by local unit UUID before locking (consistent order with other txns).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isExcludedCompanyVehicle } from "../samsara-master-sync.service.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..", "..", "..");
const SRC = readFileSync(resolve(ROOT, "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts"), "utf8");

describe("TELEMATICS-DEADLOCK-02 — samsara-master-sync units deadlock fix (structural)", () => {
  it("imports sortForUnitLockOrder from unit-lock-order (fix-b: lock order)", () => {
    expect(SRC).toMatch(/sortForUnitLockOrder.*from.*unit-lock-order/);
  });

  it("calls sortForUnitLockOrder on the vehicles array before the per-vehicle loop", () => {
    const vehicleFn = SRC.slice(
      SRC.indexOf("export async function syncSamsaraVehiclesMaster("),
      SRC.indexOf("export async function syncSamsaraTrailersMaster(")
    );
    expect(vehicleFn).toMatch(/sortForUnitLockOrder\s*\(/);
  });

  it("has a Phase 1 UPDATE that does NOT touch samsara_vehicle_id or vin (fix-a: non-unique only)", () => {
    // Phase 1 should set make/model/year/license_plate/license_state but NOT the unique columns
    const vehicleFn = SRC.slice(
      SRC.indexOf("export async function syncSamsaraVehiclesMaster("),
      SRC.indexOf("export async function syncSamsaraTrailersMaster(")
    );
    // The SET make = ... UPDATE must not include samsara_vehicle_id or vin in the same SET clause
    const phase1Match = vehicleFn.match(/SET make\s*=[\s\S]*?WHERE id\s*=\s*\$1::uuid/);
    expect(phase1Match).toBeTruthy();
    const phase1 = phase1Match![0];
    expect(phase1).not.toMatch(/samsara_vehicle_id/);
    expect(phase1).not.toMatch(/\bvin\b/);
  });

  it("has a Phase 2 UPDATE that ONLY fires when needsSid or needsVin is true (fix-a: conditional)", () => {
    const vehicleFn = SRC.slice(
      SRC.indexOf("export async function syncSamsaraVehiclesMaster("),
      SRC.indexOf("export async function syncSamsaraTrailersMaster(")
    );
    expect(vehicleFn).toMatch(/needsSid\s*\|\|\s*needsVin/);
    expect(vehicleFn).toMatch(/needsSid\s*=\s*!row\.sid/);
    expect(vehicleFn).toMatch(/needsVin/);
    // Phase 2 UPDATE must set samsara_vehicle_id
    const phase2Match = vehicleFn.match(/SET samsara_vehicle_id\s*=[\s\S]*?WHERE id\s*=\s*\$1::uuid/);
    expect(phase2Match).toBeTruthy();
  });

  it("pre-fetches unit IDs in a batch before the loop (for sort order)", () => {
    const vehicleFn = SRC.slice(
      SRC.indexOf("export async function syncSamsaraVehiclesMaster("),
      SRC.indexOf("export async function syncSamsaraTrailersMaster(")
    );
    // Batch query uses ANY($1) to look up multiple units at once
    expect(vehicleFn).toMatch(/ANY\s*\(\s*\$1/);
  });
});

describe("isExcludedCompanyVehicle (unchanged — regression guard)", () => {
  it("still excludes known company cars", () => {
    expect(isExcludedCompanyVehicle("Nissan", "Versa")).toBe(true);
    expect(isExcludedCompanyVehicle("Honda", "Element")).toBe(true);
    expect(isExcludedCompanyVehicle("Freightliner", "Cascadia")).toBe(false);
    expect(isExcludedCompanyVehicle(null, null)).toBe(false);
  });
});
