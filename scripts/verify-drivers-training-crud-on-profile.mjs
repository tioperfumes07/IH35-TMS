#!/usr/bin/env node
/**
 * Block A24-7: DriverProfile + Add training modal wired to POST /api/v1/mdata/drivers/:id/training.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  addTrainingModal: path.join(ROOT, "apps/frontend/src/components/drivers/AddTrainingModal.tsx"),
  driverProfilePage: path.join(ROOT, "apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  trainingSection: path.join(ROOT, "apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx"),
  frontendTest: path.join(ROOT, "apps/frontend/src/components/drivers/__tests__/AddTrainingModal.test.tsx"),
  driverTrainingRoutes: path.join(ROOT, "apps/backend/src/mdata/driver-training.routes.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-training-crud-on-profile] ${msg}`);
  process.exit(1);
}

function inspectTrainingLifecycle(driverTrainingRoutes) {
  const failures = [];
  const patchStart = driverTrainingRoutes.indexOf('app.patch("/api/v1/mdata/drivers/:id/training/:training_id"');
  const archiveStart = driverTrainingRoutes.indexOf('app.post("/api/v1/mdata/drivers/:id/training/:training_id/archive"');
  const patch = driverTrainingRoutes.slice(patchStart, archiveStart);
  const archive = driverTrainingRoutes.slice(archiveStart);
  if (!/const trainingRecord = res\.rows\[0\] \?\? null;[\s\S]{0,100}if \(!trainingRecord\) return null;[\s\S]{0,180}appendCrudAudit\(client, authUser\.uuid, "safety\.training_record\.updated"[\s\S]{0,260}resource_id: trainingRecord\.id[\s\S]{0,180}driver_id: params\.data\.id/.test(patch)) {
    failures.push("training edit must audit only after its exact canonical write returns identity");
  }
  if (!/const trainingRecord = res\.rows\[0\] \?\? null;[\s\S]{0,100}if \(!trainingRecord\) return null;[\s\S]{0,180}appendCrudAudit\(client, authUser\.uuid, "safety\.training_record\.archived"[\s\S]{0,260}resource_id: trainingRecord\.id[\s\S]{0,180}driver_id: params\.data\.id/.test(archive)) {
    failures.push("training archive must audit only after its exact canonical write returns identity");
  }
  return failures;
}

function main() {
  const addTrainingModal = read(paths.addTrainingModal);
  const driverProfilePage = read(paths.driverProfilePage);
  const trainingSection = read(paths.trainingSection);
  const frontendTest = read(paths.frontendTest);
  const driverTrainingRoutes = read(paths.driverTrainingRoutes);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!driverTrainingRoutes.includes('app.post("/api/v1/mdata/drivers/:id/training"')) {
    failures.push("Backend must expose POST /api/v1/mdata/drivers/:id/training");
  }
  if (!addTrainingModal.includes("/api/v1/mdata/drivers/${driverId}/training")) {
    failures.push("AddTrainingModal must POST per-driver training endpoint");
  }
  if (!addTrainingModal.includes("getTrainingCompletions")) {
    failures.push("AddTrainingModal must load training programs from A23-5 completions surface");
  }
  if (!addTrainingModal.includes('data-testid="add-training-modal"')) {
    failures.push("AddTrainingModal must expose add-training-modal test id");
  }
  if (!driverProfilePage.includes("<AddTrainingModal")) {
    failures.push("DriverProfilePage must render AddTrainingModal");
  }
  if (!driverProfilePage.includes("onAddTraining")) {
    failures.push("DriverProfilePage must wire + Add training handler");
  }
  if (!trainingSection.includes("onAddTraining")) {
    failures.push("TrainingRecordsSection must accept onAddTraining callback");
  }
  if (!frontendTest.includes("A24-7")) failures.push("Frontend vitest must reference A24-7");
  const testCount = (frontendTest.match(/\bit\s*\(/g) ?? []).length;
  if (testCount < 3) failures.push("AddTrainingModal.test.tsx must include at least 3 vitest cases");

  if (!archDesign.includes("verify:drivers-training-crud-on-profile")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-training-crud-on-profile");
  }
  failures.push(...inspectTrainingLifecycle(driverTrainingRoutes));

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      driverTrainingRoutes.replace('"safety.training_record.updated"', '"safety.training_record.missing"'),
      driverTrainingRoutes.replace('"safety.training_record.archived"', '"safety.training_record.missing"'),
      driverTrainingRoutes.replaceAll("resource_id: trainingRecord.id", "resource_id: params.data.training_id"),
      driverTrainingRoutes.replace("if (!trainingRecord) return null;", "if (false) return null;"),
    ];
    const detected = mutations.filter((mutation) => inspectTrainingLifecycle(mutation).length > 0).length;
    if (detected !== mutations.length) fail(`selftest detected ${detected}/${mutations.length} planted lifecycle regressions`);
    console.log(`[verify-drivers-training-crud-on-profile] selftest ${detected}/${mutations.length}`);
  }

  console.log("[verify-drivers-training-crud-on-profile] OK");
}

main();
