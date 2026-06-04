#!/usr/bin/env node
/**
 * Block B27: Maintenance-side DVIR defect intake — inbox, detail, triage routes.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  defectsRoutes: path.join(ROOT, "apps/backend/src/maintenance/defects.routes.ts"),
  defectsRoutesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/defects.routes.test.ts"),
  inboxPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx"),
  detailPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/DefectDetailPage.tsx"),
  inboxTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/DefectsInboxPage.test.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  createWoModal: path.join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-dvir-defect-intake FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const defectsRoutes = read(paths.defectsRoutes);
  const defectsRoutesTest = read(paths.defectsRoutesTest);
  const inboxPage = read(paths.inboxPage);
  const detailPage = read(paths.detailPage);
  const inboxTest = read(paths.inboxTest);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const maintenanceApi = read(paths.maintenanceApi);
  const createWoModal = read(paths.createWoModal);
  const archDesign = read(paths.archDesign);

  if (!defectsRoutes.includes('app.get("/api/v1/maintenance/dvir-defects"')) {
    failures.push("defects.routes must list inbox endpoint");
  }
  if (!defectsRoutes.includes('app.get("/api/v1/maintenance/dvir-defects/:id"')) {
    failures.push("defects.routes must expose defect detail endpoint");
  }
  if (!defectsRoutes.includes('app.post("/api/v1/maintenance/dvir-defects/:id/triage"')) {
    failures.push("defects.routes must expose triage endpoint");
  }
  if (!defectsRoutes.includes("safety.dvir_defects")) {
    failures.push("defects.routes must read safety.dvir_defects");
  }
  if (!defectsRoutes.includes("maintenance.dvir_defect.")) {
    failures.push("defects.routes must emit maintenance.dvir_defect.* audit events");
  }
  if ((defectsRoutesTest.match(/\bit\(/g) ?? []).length < 5) {
    failures.push("defects.routes.test must include at least 5 vitest cases");
  }
  if (!inboxPage.includes("maint-dvir-defects-inbox")) {
    failures.push("DefectsInboxPage must expose inbox test id");
  }
  if (!inboxPage.includes("Convert to WO")) {
    failures.push("DefectsInboxPage must offer Convert to WO triage");
  }
  if (!detailPage.includes("maint-dvir-defect-detail")) {
    failures.push("DefectDetailPage must expose detail test id");
  }
  if (!detailPage.includes("CreateWorkOrderModal")) {
    failures.push("DefectDetailPage must wire CreateWorkOrderModal");
  }
  if ((inboxTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("DefectsInboxPage.test must include at least 3 vitest cases");
  }
  if (!manifest.includes('path="/maintenance/defects"')) {
    failures.push("manifest must register /maintenance/defects route");
  }
  if (!manifest.includes('path="/maintenance/defects/:defectId"')) {
    failures.push("manifest must register defect detail route");
  }
  if (!index.includes("registerMaintenanceDefectsRoutes")) {
    failures.push("backend index must register maintenance defects routes");
  }
  if (!maintenanceApi.includes("listMaintenanceDvirDefects")) {
    failures.push("maintenance API client must expose listMaintenanceDvirDefects");
  }
  if (!createWoModal.includes("initialValues")) {
    failures.push("CreateWorkOrderModal must support initialValues prefill");
  }
  if (!archDesign.includes("verify:maint-dvir-defect-intake")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-dvir-defect-intake");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-dvir-defect-intake PASS");
}

main();
