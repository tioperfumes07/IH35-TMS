#!/usr/bin/env node
/** CU-09 — CancelLoadModal must not toast bare E_* codes. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/components/dispatch/CancelLoadModal.tsx";
const HELPER_FILE = "apps/frontend/src/lib/api-error-message.ts";
const LABEL = "verify-cancel-load-human-errors";
const SELFTEST = process.argv.includes("--selftest");

function assert(src, helperSrc) {
  const problems = [];
  if (!/userFacingApiError\(err,\s*"Cancel failed"\)/.test(src)) {
    problems.push(`${FILE}: cancel errors must flow through the shared userFacingApiError helper`);
  }
  if (!/replace\(\/\^E_\//.test(helperSrc)) {
    problems.push(`${HELPER_FILE}: shared helper must humanize bare E_* codes (replace /^E_/)`);
  }
  if (/Cancel failed: \$\{data\.error\}/.test(src) && !/E_\[A-Z0-9_\]/.test(src)) {
    problems.push(`${FILE}: still interpolates data.error without E_* humanize`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const helper = fs.readFileSync(path.join(ROOT, HELPER_FILE), "utf8");
  const plantedCall = live.replace(/userFacingApiError\(err,\s*"Cancel failed"\)/, 'String(err)');
  const plantedHelper = helper.replace(/replace\(\/\^E_\//, "/*removed*/");
  if (!assert(plantedCall, helper).length || !assert(live, plantedHelper).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted helper/call-site defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live, helper);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(
  fs.readFileSync(path.join(ROOT, FILE), "utf8"),
  fs.readFileSync(path.join(ROOT, HELPER_FILE), "utf8")
);
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
