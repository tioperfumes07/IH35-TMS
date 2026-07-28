#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cronPath = path.join(ROOT, "apps/backend/src/cron/depreciation-autopost.cron.ts");
const indexPath = path.join(ROOT, "apps/backend/src/index.ts");

function fail(message) {
  console.error(`verify:depreciation-autopost-wired FAIL: ${message}`);
  process.exit(1);
}

for (const target of [cronPath, indexPath]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const cron = fs.readFileSync(cronPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

for (const required of [
  "initializeDepreciationAutopostCron",
  "runDepreciationAutopostCronTick",
  "node-cron",
  "wrapBackgroundJobTick",
  "withLuciaBypass",
  "assertTenantContext",
  "FIXED_ASSET_AUTOPOST_ENABLED",
  "postDepreciation",
  "INSERT INTO accounting.depreciation_autopost_runs",
  "COALESCE(unit.is_sample_data, false) = false",
  "15 6 1 * *",
]) {
  if (!cron.includes(required)) fail(`cron missing required wiring: ${required}`);
}

for (const outcome of ["posted", "nothing_to_post", "skipped_flag_off", "error"]) {
  if (!cron.includes(`"${outcome}"`)) fail(`cron must persist ${outcome} run outcome`);
}

if (!index.includes('from "./cron/depreciation-autopost.cron.js"')) {
  fail("index.ts must import depreciation-autopost cron");
}
if (!index.includes("initializeDepreciationAutopostCron(app)")) {
  fail("index.ts must initialize depreciation-autopost cron");
}

console.log("verify:depreciation-autopost-wired PASS");
