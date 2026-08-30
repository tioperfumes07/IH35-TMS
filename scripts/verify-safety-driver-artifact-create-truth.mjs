#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const trainingPath = path.join(root, "apps/backend/src/safety/training-records.routes.ts");
const backgroundPath = path.join(root, "apps/backend/src/safety/background-checks.routes.ts");
const driverProfileTrainingPath = path.join(root, "apps/backend/src/mdata/driver-training.routes.ts");

function verify(training, background, driverProfileTraining) {
  const failures = [];
  const requireMatch = (source, pattern, message) => {
    if (!pattern.test(source)) failures.push(message);
  };

  const singleTraining = training.slice(training.indexOf('app.post("/api/v1/safety/training-records"'), training.indexOf('app.post("/api/v1/safety/training-records/batch"'));
  const batchTraining = training.slice(training.indexOf('app.post("/api/v1/safety/training-records/batch"'));
  const backgroundCreate = background.slice(background.indexOf('app.post("/api/v1/safety/background-checks"'));
  const driverProfileCreate = driverProfileTraining.slice(
    driverProfileTraining.indexOf('app.post("/api/v1/mdata/drivers/:id/training"'),
    driverProfileTraining.indexOf('app.patch("/api/v1/mdata/drivers/:id/training/:training_id"'),
  );
  requireMatch(singleTraining, /d\.archived_at IS NULL[\s\S]*?training_create_driver_dca/, "single training create must reject archived drivers");
  requireMatch(batchTraining, /d\.archived_at IS NULL[\s\S]*?training_batch_dca/, "batch training create must reject archived drivers");
  requireMatch(backgroundCreate, /d\.archived_at IS NULL[\s\S]*?background_check_create_driver_dca/, "background-check create must reject archived drivers");
  requireMatch(training, /if \(!trainingRecord\?\.id\) throw new Error\("safety_training_record_insert_failed"\)/, "single training create must require inserted identity");
  requireMatch(training, /inserted\.rows\.length !== body\.data\.driver_ids\.length[\s\S]*?inserted\.rows\.some\(\(row\) => !row\.id \|\| !row\.driver_id\)/, "batch training create must require every inserted identity");
  requireMatch(background, /if \(!backgroundCheck\?\.id\) throw new Error\("safety_background_check_insert_failed"\)/, "background-check create must require inserted identity");
  requireMatch(training, /resource_id: trainingRecord\.id/, "single training audit must use proven identity");
  requireMatch(training, /resource_id: row\.id[\s\S]*?driver_id: row\.driver_id/, "batch training audits must use proven identities");
  requireMatch(background, /resource_id: backgroundCheck\.id/, "background-check audit must use proven identity");
  requireMatch(driverProfileCreate, /if \(!trainingRecord\?\.id\) throw new Error\("driver_profile_training_record_insert_failed"\)/, "driver-profile training create must require inserted identity");
  requireMatch(driverProfileCreate, /resource_id: trainingRecord\.id/, "driver-profile training audit must use proven identity");
  requireMatch(driverProfileCreate, /return trainingRecord;/, "driver-profile training response must use proven identity");
  return failures;
}

const training = fs.readFileSync(trainingPath, "utf8");
const background = fs.readFileSync(backgroundPath, "utf8");
const driverProfileTraining = fs.readFileSync(driverProfileTrainingPath, "utf8");
const failures = verify(training, background, driverProfileTraining);
if (failures.length) {
  console.error(`verify-safety-driver-artifact-create-truth: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["single archived-driver gate", training.replace("AND d.archived_at IS NULL\n           AND (d.operating_company_id", "AND true\n           AND (d.operating_company_id"), background, driverProfileTraining],
    ["batch archived-driver gate", training.replace("WHERE d.archived_at IS NULL\n            AND (d.operating_company_id", "WHERE true\n            AND (d.operating_company_id"), background, driverProfileTraining],
    ["background archived-driver gate", training, background.replace("AND d.archived_at IS NULL\n           AND (d.operating_company_id = $2::uuid OR EXISTS (\n             SELECT 1 FROM mdata.driver_company_authorizations background_check_create_driver_dca", "AND true\n           AND (d.operating_company_id = $2::uuid OR EXISTS (\n             SELECT 1 FROM mdata.driver_company_authorizations background_check_create_driver_dca"), driverProfileTraining],
    ["single inserted identity", training.replace("if (!trainingRecord?.id)", "if (false)"), background, driverProfileTraining],
    ["batch inserted count", training.replace("inserted.rows.length !== body.data.driver_ids.length", "false"), background, driverProfileTraining],
    ["background inserted identity", training, background.replace("if (!backgroundCheck?.id)", "if (false)"), driverProfileTraining],
    ["single audit identity", training.replace("resource_id: trainingRecord.id", "resource_id: null"), background, driverProfileTraining],
    ["batch audit identity", training.replace("resource_id: row.id", "resource_id: null"), background, driverProfileTraining],
    ["background audit identity", training, background.replace("resource_id: backgroundCheck.id", "resource_id: null"), driverProfileTraining],
    ["driver-profile inserted identity", training, background, driverProfileTraining.replace("if (!trainingRecord?.id)", "if (false)")],
    ["driver-profile audit identity", training, background, driverProfileTraining.replace("resource_id: trainingRecord.id", "resource_id: null")],
    ["driver-profile response identity", training, background, driverProfileTraining.replace("return trainingRecord;", "return res.rows[0];")],
  ];
  const survived = mutations.filter(([, mutatedTraining, mutatedBackground, mutatedDriverProfile]) => verify(mutatedTraining, mutatedBackground, mutatedDriverProfile).length === 0);
  if (survived.length) {
    console.error(`verify-safety-driver-artifact-create-truth --selftest: FAIL; survived ${survived.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-safety-driver-artifact-create-truth --selftest: PASS (${mutations.length}/${mutations.length} mutations red)`);
} else {
  console.log("verify-safety-driver-artifact-create-truth: PASS — training and background-check creators reject archived drivers and prove every inserted audit identity");
}
