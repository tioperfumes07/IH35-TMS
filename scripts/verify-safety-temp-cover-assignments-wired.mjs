#!/usr/bin/env node
// SAFETY-TEMP-COVER-ASSIGNMENTS-ZERO-FE-CALLERS (verify-step reserved separately).
//
// ROOT CAUSE this closes: /api/v1/safety/scheduler/temp-assignments (GET list, POST create, POST
// :id/cancel) has existed since GAP-81's driver-scheduler build with ZERO frontend callers anywhere
// — not a missing button on an otherwise-complete UI, the entire feature was unreachable. Filed as
// its own block earlier this session (deliberately not rushed then, given the 3-entity-picker scope);
// built here in full: list + create (unit/primary-driver/cover-driver pickers + date range, never a
// raw-id input) + cancel (reason required, matching this app's void/cancel pattern).
//
// Also swept apps/backend/src/safety/driver-scheduler.service.ts for the DA-PROGRAM-ROUTES-500 class
// of bug (operating_company_id compared with no ::uuid cast — that table's column is UUID NOT NULL,
// same as safety.da_test_records/da_program_enrollments) and found 29 more uncast occurrences across
// EVERY function in the file (leave policies, requests, balances — not just temp-assignments), all
// fixed here.
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const BACKEND_SERVICE = "apps/backend/src/safety/driver-scheduler.service.ts";
const API_FILE = "apps/frontend/src/api/driver-scheduler.ts";
const PAGE_FILE = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx";

function fail(msg) {
  console.error(`FAIL verify-safety-temp-cover-assignments-wired: ${msg}`);
  process.exitCode = 1;
}

function countUncastOpco(src) {
  const staticPat = /operating_company_id\s*=\s*\$\d+(?!::uuid)/g;
  const dynamicPat = /operating_company_id\s*=\s*\$\$\{[^}]+\}(?!::uuid)/g;
  return (src.match(staticPat) ?? []).length + (src.match(dynamicPat) ?? []).length;
}

function checkBackend(src) {
  const uncast = countUncastOpco(src);
  if (uncast > 0) {
    fail(`${BACKEND_SERVICE}: ${uncast} operating_company_id comparison(s) still uncast — the 42883 class this file was fully swept for.`);
  }
  if (!src.includes("LEFT JOIN mdata.units u ON u.id = t.unit_id")) {
    fail(`${BACKEND_SERVICE}: listTempAssignments() no longer joins unit/driver names — the FE has nothing to render.`);
  }
}

function checkApi(src) {
  for (const fn of ["listTempAssignments(", "assignTempCover(", "cancelTempCover("]) {
    if (!src.includes(fn)) fail(`${API_FILE}: ${fn.slice(0, -1)} client function missing.`);
  }
}

function checkPage(src) {
  if (!src.includes("driverSchedulerOfficeApi.listTempAssignments(")) {
    fail(`${PAGE_FILE}: no longer calls listTempAssignments — the list is unreachable again.`);
  }
  if (!src.includes("driverSchedulerOfficeApi.assignTempCover(")) {
    fail(`${PAGE_FILE}: no longer calls assignTempCover — create is unreachable again.`);
  }
  if (!src.includes("driverSchedulerOfficeApi.cancelTempCover(")) {
    fail(`${PAGE_FILE}: no longer calls cancelTempCover — cancel is unreachable again.`);
  }
  if (!/kind="unit"/.test(src) || !src.includes("DriverPickerWithCreate")) {
    fail(`${PAGE_FILE}: create form no longer uses the canonical unit/driver pickers.`);
  }
  if (!src.includes('data-testid="driver-scheduler-temp-cover-section"')) {
    fail(`${PAGE_FILE}: the temp-cover section is no longer rendered.`);
  }
}

function runChecks() {
  checkBackend(fs.readFileSync(BACKEND_SERVICE, "utf8"));
  checkApi(fs.readFileSync(API_FILE, "utf8"));
  checkPage(fs.readFileSync(PAGE_FILE, "utf8"));
}

function selftest() {
  let probesProven = 0;

  // Mutation 1: reintroduce an uncast comparison in the backend service.
  {
    const original = fs.readFileSync(BACKEND_SERVICE, "utf8");
    const mutated = original.replace("t.operating_company_id = $1::uuid", "t.operating_company_id = $1");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: cast pattern not found in listTempAssignments.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(BACKEND_SERVICE, mutated);
    let caught = false;
    try {
      checkBackend(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(BACKEND_SERVICE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: reintroducing an uncast comparison was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: drop the create call from the page.
  {
    const original = fs.readFileSync(PAGE_FILE, "utf8");
    const mutated = original.replace("driverSchedulerOfficeApi.assignTempCover(", "Promise.resolve(");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: assignTempCover call pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(PAGE_FILE, mutated);
    let caught = false;
    try {
      checkPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(PAGE_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping the assignTempCover call was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 3: drop the cancel call from the page.
  {
    const original = fs.readFileSync(PAGE_FILE, "utf8");
    const mutated = original.replace("driverSchedulerOfficeApi.cancelTempCover(", "Promise.resolve(");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: cancelTempCover call pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(PAGE_FILE, mutated);
    let caught = false;
    try {
      checkPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(PAGE_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping the cancelTempCover call was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-safety-temp-cover-assignments-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  runChecks();
  if (process.exitCode !== 1) {
    console.log("PASS verify-safety-temp-cover-assignments-wired");
  }
}
