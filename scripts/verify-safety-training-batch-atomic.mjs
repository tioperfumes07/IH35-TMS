#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const BACKEND = "apps/backend/src/safety/training-records.routes.ts";
const API = "apps/frontend/src/api/safety.ts";
const PAGE = "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx";

function inspect(backend, api, page) {
  const errors = [];
  if (!backend.includes('app.post("/api/v1/safety/training-records/batch"')) errors.push("batch route missing");
  if (!backend.includes("driver_ids must be unique") || !backend.includes(".max(100)")) errors.push("batch bounds/uniqueness missing");
  const eligibleAt = backend.indexOf("eligible.rows.length !== body.data.driver_ids.length");
  const insertAt = backend.indexOf("INSERT INTO safety.training_records", backend.indexOf("training-records/batch"));
  if (eligibleAt < 0 || insertAt < 0 || eligibleAt > insertAt) errors.push("all drivers must be company-validated before insert");
  if (!backend.includes("FROM unnest($6::uuid[]) requested(driver_id)") || !backend.includes("for (const row of inserted.rows)")) errors.push("single bulk insert or per-row audit missing");
  if (!api.includes("createSafetyTrainingRecordsBatch") || !api.includes("training-records/batch")) errors.push("frontend batch API missing");
  if (!page.includes("createSafetyTrainingRecordsBatch(input.companyId") || page.includes("await Promise.all(")) errors.push("training assignment still allows partial per-driver writes");
  if (!page.includes("driver_ids: input.driverIds")) errors.push("complete selected driver set not submitted");
  return errors;
}

const backend = fs.readFileSync(BACKEND, "utf8");
const api = fs.readFileSync(API, "utf8");
const page = fs.readFileSync(PAGE, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace('app.post("/api/v1/safety/training-records/batch"', 'app.post("/removed"'), api, page],
    [backend.replace("eligible.rows.length !== body.data.driver_ids.length", "false"), api, page],
    [backend, api, page.replace("createSafetyTrainingRecordsBatch(input.companyId", "createSafetyTrainingRecord(input.companyId")],
    [backend, api, `${page}\nawait Promise.all([]);`],
  ];
  const missed = mutations.filter(([b, a, p]) => inspect(b, a, p).length === 0);
  if (missed.length) {
    console.error(`verify-safety-training-batch-atomic SELFTEST FAIL — ${missed.length}/4 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-training-batch-atomic selftest PASS — 4/4 partial-write regressions rejected");
  process.exit(0);
}

const errors = inspect(backend, api, page);
if (errors.length) {
  console.error("verify-safety-training-batch-atomic FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-training-batch-atomic PASS — selected drivers validate and insert atomically with per-row audit");
