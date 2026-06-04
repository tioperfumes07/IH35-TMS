#!/usr/bin/env node
/**
 * Block B26: TrailerProfile WO history filters by equipment_id (not attached unit_id).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0358_work_orders_equipment_id.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/work-orders.routes.ts"),
  activity: path.join(ROOT, "apps/frontend/src/components/trailer-profile/TrailerRecentActivitySection.tsx"),
  profilePage: path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"),
  backendTest: path.join(ROOT, "apps/backend/src/maintenance/work-orders.routes.test.ts"),
  frontendTest: path.join(
    ROOT,
    "apps/frontend/src/components/trailer-profile/__tests__/TrailerRecentActivitySection.test.tsx"
  ),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:trailer-wo-equipment-id FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const activity = read(paths.activity);
  const profilePage = read(paths.profilePage);
  const backendTest = read(paths.backendTest);
  const frontendTest = read(paths.frontendTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("equipment_id uuid")) {
    failures.push("migration 0358 must add equipment_id column");
  }
  if (!routes.includes("w.equipment_id =")) {
    failures.push("work-orders list route must filter by equipment_id");
  }
  if (!activity.includes("equipment_id=${encodeURIComponent(equipmentId)}")) {
    failures.push("TrailerRecentActivitySection must query work orders by equipment_id");
  }
  if (activity.includes("attachedUnitId")) {
    failures.push("TrailerRecentActivitySection must not depend on attachedUnitId for WO history");
  }
  if (activity.includes("No truck attached.")) {
    failures.push("TrailerRecentActivitySection must not gate WO list on attached truck");
  }
  if (!profilePage.includes("<TrailerRecentActivitySection equipmentId={id} companyId={companyId} />")) {
    failures.push("TrailerProfilePage must wire TrailerRecentActivitySection without attachedUnitId");
  }
  if (!backendTest.includes("equipment_id filter")) {
    failures.push("backend vitest must cover equipment_id filter");
  }
  if (!frontendTest.includes("equipment_id=")) {
    failures.push("frontend vitest must assert equipment_id query param");
  }
  if (!archDesign.includes("verify:trailer-wo-equipment-id")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:trailer-wo-equipment-id");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:trailer-wo-equipment-id PASS");
}

main();
