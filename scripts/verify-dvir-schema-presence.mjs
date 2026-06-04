#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DVIR_SCHEMA_ROOT ?? process.cwd();

const paths = {
  migration: path.join(ROOT, "db/migrations/0344_safety_dvir.sql"),
  routes: path.join(ROOT, "apps/backend/src/safety/dvir.routes.ts"),
  submitService: path.join(ROOT, "apps/backend/src/safety/dvir-submit.service.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  idvrPage: path.join(ROOT, "apps/frontend/src/pages/safety/IdvrPage.tsx"),
  idvrTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/IDVRTab.tsx"),
  driverDvir: path.join(ROOT, "apps/driver-pwa/src/pages/DVIR.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const submitService = read(paths.submitService);
  const index = read(paths.index);
  const tabsConfig = read(paths.tabsConfig);
  const idvrPage = read(paths.idvrPage);
  const idvrTab = read(paths.idvrTab);
  const driverDvir = read(paths.driverDvir);

  for (const [label, filePath] of Object.entries(paths)) {
    if (!fs.existsSync(filePath)) failures.push(`missing required file: ${label}`);
  }

  if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.dvir_submissions")) {
    failures.push("migration 0344 must create safety.dvir_submissions");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.dvir_defects")) {
    failures.push("migration 0344 must create safety.dvir_defects");
  }
  if (!migration.includes("chk_safety_dvir_defect_photo_keys_max")) {
    failures.push("migration 0344 must enforce max 5 photos per defect");
  }

  if (!routes.includes('app.get("/api/v1/safety/dvir"')) {
    failures.push("safety dvir routes must expose list endpoint");
  }
  if (!routes.includes('app.get("/api/v1/safety/dvir/:id"')) {
    failures.push("safety dvir routes must expose detail endpoint");
  }
  if (!routes.includes('app.post("/api/v1/safety/dvir"')) {
    failures.push("safety dvir routes must expose submit endpoint");
  }

  if (!submitService.includes("INSERT INTO safety.dvir_submissions")) {
    failures.push("dvir submit service must write safety.dvir_submissions");
  }
  if (!submitService.includes("INSERT INTO safety.dvir_defects")) {
    failures.push("dvir submit service must write safety.dvir_defects");
  }
  if (!submitService.includes("'dvir'")) {
    failures.push("dvir submit service must auto-spawn maintenance WO with dvir origin");
  }
  if (!submitService.includes("set_unit_dispatch_block")) {
    failures.push("dvir submit service must block dispatch on major defects");
  }

  if (!index.includes("registerSafetyDvirRoutes")) {
    failures.push("backend index must register safety DVIR routes");
  }

  if (!tabsConfig.includes('id: "idvr"') || !tabsConfig.match(/id:\s*"idvr"[\s\S]*?status:\s*"Live"/)) {
    failures.push("SAFETY_TABS_CONFIG idvr tab must be Live");
  }
  if (!idvrPage.includes("export function IdvrPage")) {
    failures.push("IdvrPage.tsx missing canonical export");
  }
  if (!idvrTab.includes("IdvrPage")) {
    failures.push("IDVRTab must render IdvrPage");
  }
  if (!driverDvir.includes("dvir-pre-page") || !driverDvir.includes("dvir-post-page")) {
    failures.push("Driver PWA DVIR page must expose pre/post trip markers");
  }
  const loadDetail = read(path.join(ROOT, "apps/driver-pwa/src/pages/LoadDetail.tsx"));
  if (!loadDetail.includes("dvir-pre-trip-card") || !loadDetail.includes("dvir-post-trip-card")) {
    failures.push("LoadDetail must expose pre-trip and post-trip DVIR cards");
  }

  if (failures.length > 0) {
    console.error("verify:dvir-schema-presence FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:dvir-schema-presence OK");
}

main();
