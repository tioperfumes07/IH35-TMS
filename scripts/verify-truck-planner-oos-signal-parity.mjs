#!/usr/bin/env node
/**
 * DISP-F6436 — Dispatch Truck Planner (apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx)
 * decided a unit was "in-shop" (renders red "shop") using only 2 of the 4 OOS signals the sibling
 * FleetOosStrip.tsx (Dispatch Overview/Kanban "FLEET OOS / IN SHOP" strip) already checks against
 * the exact same mdata.units row shape returned by listUnits() -- `unit.is_oos` and the raw
 * `unit.status` enum (InMaintenance/OutOfService/Damaged) were missing.
 *
 * Live-confirmed on origin/main: all 14 units in FleetOosStrip's own "FLEET OOS / IN SHOP (14)"
 * list (flagged via unit.is_oos, no open PM-due WO and not dispatch-blocked) rendered "avl"
 * (available) every single day across the Truck Planner's 30-day grid. A dispatcher reading only
 * the planner -- the exact surface used to decide which truck to assign a load to -- would see
 * those trucks as fully bookable, when the Overview correctly shows them parked in the shop.
 *
 * FIX: TruckPlanner.tsx's inShop predicate now also checks `unit.is_oos` and a local
 * IN_SHOP_UNIT_STATUSES set. This guard proves both files' status-enum sets stay identical (so an
 * addition to one that's forgotten in the other reintroduces the exact same silent disagreement)
 * and that TruckPlanner's predicate references all 4 signals, not just the original 2.
 */
import fs from "node:fs";

const TRUCK_PLANNER_FILE = "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx";
const FLEET_OOS_STRIP_FILE = "apps/frontend/src/components/dispatch/FleetOosStrip.tsx";

function extractStatusSet(text, constName) {
  const marker = `const ${constName} = new Set([`;
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const end = text.indexOf("]);", start);
  if (end < 0) return null;
  const body = text.slice(start + marker.length, end);
  return body
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .sort();
}

function audit(truckPlannerText, fleetOosStripText) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const truckSet = extractStatusSet(truckPlannerText, "IN_SHOP_UNIT_STATUSES");
  const stripSet = extractStatusSet(fleetOosStripText, "IN_SHOP_STATUSES");

  need(Boolean(truckSet), "TruckPlanner.tsx is missing its own IN_SHOP_UNIT_STATUSES set");
  need(Boolean(stripSet), "FleetOosStrip.tsx is missing its own IN_SHOP_STATUSES set (sibling moved/renamed?)");

  if (truckSet && stripSet) {
    need(
      JSON.stringify(truckSet) === JSON.stringify(stripSet),
      `TruckPlanner.tsx IN_SHOP_UNIT_STATUSES [${truckSet.join(", ")}] no longer matches ` +
        `FleetOosStrip.tsx IN_SHOP_STATUSES [${stripSet.join(", ")}] -- the two dispatch surfaces ` +
        `will disagree again about which units are out of service`,
    );
  }

  // The inShop predicate must reference all 4 signals: the two original booleans, is_oos, and the
  // status-set membership check -- not just a subset.
  const predicateStart = truckPlannerText.indexOf("const inShop =");
  const predicateEnd = predicateStart >= 0 ? truckPlannerText.indexOf(";", predicateStart) : -1;
  const predicate = predicateStart >= 0 && predicateEnd > predicateStart
    ? truckPlannerText.slice(predicateStart, predicateEnd)
    : "";

  need(predicate.includes("unit.has_open_pm_due_wo"), "inShop predicate dropped the has_open_pm_due_wo check");
  need(predicate.includes("unit.is_dispatch_blocked"), "inShop predicate dropped the is_dispatch_blocked check");
  need(predicate.includes("unit.is_oos"), "inShop predicate dropped the is_oos check (the DISP-F6436 fix)");
  need(
    predicate.includes("IN_SHOP_UNIT_STATUSES.has"),
    "inShop predicate dropped the IN_SHOP_UNIT_STATUSES membership check (the DISP-F6436 fix)",
  );

  return failures;
}

function main() {
  const isSelftest = process.argv.includes("--selftest");
  const truckPlannerText = fs.readFileSync(TRUCK_PLANNER_FILE, "utf8");
  const fleetOosStripText = fs.readFileSync(FLEET_OOS_STRIP_FILE, "utf8");

  if (isSelftest) {
    const mutations = [
      {
        name: "drop is_oos check",
        text: truckPlannerText.replace("Boolean(unit.is_oos) ||\n        ", ""),
      },
      {
        name: "drop IN_SHOP_UNIT_STATUSES check",
        text: truckPlannerText.replace(
          "(unit.status != null && IN_SHOP_UNIT_STATUSES.has(String(unit.status)))",
          "false",
        ),
      },
      {
        name: "drop has_open_pm_due_wo check",
        text: truckPlannerText.replace("Boolean(unit.has_open_pm_due_wo) ||\n        ", ""),
      },
      {
        name: "desync the status set (add a value only on one side)",
        text: truckPlannerText.replace(
          'new Set(["InMaintenance", "OutOfService", "Damaged"])',
          'new Set(["InMaintenance", "OutOfService", "Damaged", "Retired"])',
        ),
      },
    ];
    let caught = 0;
    for (const m of mutations) {
      const failures = audit(m.text, fleetOosStripText);
      if (failures.length > 0) {
        caught += 1;
      } else {
        console.error(`SELFTEST FAIL — mutation "${m.name}" was NOT caught`);
      }
    }
    if (caught !== mutations.length) {
      console.error(`verify-truck-planner-oos-signal-parity selftest: ${caught}/${mutations.length} mutations caught`);
      process.exit(1);
    }
    console.log(`verify-truck-planner-oos-signal-parity selftest: OK — ${caught}/${mutations.length} mutations caught`);
    return;
  }

  const failures = audit(truckPlannerText, fleetOosStripText);
  if (failures.length > 0) {
    console.error("verify-truck-planner-oos-signal-parity: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-truck-planner-oos-signal-parity: OK — TruckPlanner's in-shop predicate checks all 4 OOS " +
      "signals (has_open_pm_due_wo, is_dispatch_blocked, is_oos, status-enum) and its status set " +
      "stays identical to FleetOosStrip.tsx's",
  );
}

main();
