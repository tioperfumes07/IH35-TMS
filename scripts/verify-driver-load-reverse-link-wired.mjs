#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["docs.pod"],"task":"DISP-F5854-POD-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
// CLASS-WAVE B (reverse_link/connectivity) — Wave-B investigation (2026-08-12) found these two
// reverse-link families already fully built in code but never tagged in
// docs/specs/scoreboard/wire-sprint-built.json, so the module matrix showed them red despite the
// wiring being real. This is a REGRESSION guard for existing wiring, not new feature work.
//
// Family 1 — driver -> cash advances reverse read: GET /api/v1/cash-advances?driver_id=... lets a
// driver profile drill into every cash advance issued to that driver (forward: advance -> driver_id
// FK already existed; reverse: driver -> its advances via the query param).
//
// Family 2 — load -> POD documents reverse read: GET /api/v1/dispatch/pod-documents?load_id=... lets
// a load detail page drill into every proof-of-delivery document filed against it.
//
// Static source check — no DB needed. Confirms the route + filter param exist; does not re-verify
// the SQL behind them (that is the job of the money-path / dispatch guards already covering these
// files for their own concerns).
import fs from "node:fs";

const CASH_ADVANCES_ROUTES = "apps/backend/src/cash-advances/cash-advances.routes.ts";
const POD_ROUTES = "apps/backend/src/dispatch/pod.routes.ts";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-driver-load-reverse-link-wired.mjs";

function fail(msg) {
  console.error(`FAIL verify-driver-load-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

function checkCashAdvances(src) {
  if (!src.includes('app.get("/api/v1/cash-advances"')) {
    fail(`${CASH_ADVANCES_ROUTES}: GET /api/v1/cash-advances route not found.`);
    return;
  }
  if (!/where\.push\(`driver_id = \$\$\{values\.length\}`\)/.test(src) && !src.includes("where.push(`driver_id = $${values.length}`)")) {
    fail(`${CASH_ADVANCES_ROUTES}: driver_id query-param filter (driver -> cash advances reverse read) not found.`);
  }
}

function checkPod(src) {
  if (!src.includes('app.get("/api/v1/dispatch/pod-documents"')) {
    fail(`${POD_ROUTES}: GET /api/v1/dispatch/pod-documents route not found.`);
    return;
  }
  if (!src.includes("filters.push(`p.load_id = $${values.length}::uuid`)")) {
    fail(`${POD_ROUTES}: load_id query-param filter (load -> POD documents reverse read) not found.`);
  }
}

function checkEvidence(matrixSource, selfSource) {
  const leaf = JSON.parse(matrixSource).leaves?.find((candidate) => candidate.id === "docs.pod");
  if (!leaf?.required?.includes("reverse_link")) fail(`${MATRIX}: docs.pod must require reverse_link`);
  const annotations = selfSource.split("\n").filter((line) => line.includes("@matrix-built"));
  if (!annotations.includes('/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["docs.pod"],"task":"DISP-F5854-POD-REVERSE-EXACT-LEAF","vertical":"column-wave"} */')) {
    fail(`${SELF}: Built annotation must credit only docs.pod:reverse_link`);
  }
}

function selftest() {
  const originalCash = fs.readFileSync(CASH_ADVANCES_ROUTES, "utf8");
  const originalPod = fs.readFileSync(POD_ROUTES, "utf8");
  const originalMatrix = fs.readFileSync(MATRIX, "utf8");
  const originalSelf = fs.readFileSync(SELF, "utf8");
  let probesProven = 0;

  {
    const mutated = originalCash.replace(
      "where.push(`driver_id = $${values.length}`)",
      "// driver_id filter removed"
    );
    if (mutated === originalCash) {
      console.error("SELFTEST SETUP FAILED: driver_id filter pattern not found to mutate.");
      process.exit(1);
    }
    checkCashAdvances(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing the driver_id cash-advances filter was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  {
    const matrix = JSON.parse(originalMatrix);
    const leaf = matrix.leaves.find((candidate) => candidate.id === "docs.pod");
    leaf.required = leaf.required.filter((column) => column !== "reverse_link");
    checkEvidence(JSON.stringify(matrix), originalSelf);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing docs.pod Required reverse_link was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  {
    const mutated = originalSelf.replace('"leaves":["docs.pod"]', '"leaves":["load.drawer.documents"]');
    checkEvidence(originalMatrix, mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (mutated === originalSelf || !caught) {
      console.error("SELFTEST INERT: changing the exact Built leaf was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  {
    const mutated = originalPod.replace(
      "filters.push(`p.load_id = $${values.length}::uuid`)",
      "// load_id filter removed"
    );
    if (mutated === originalPod) {
      console.error("SELFTEST SETUP FAILED: load_id filter pattern not found to mutate.");
      process.exit(1);
    }
    checkPod(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing the load_id POD-documents filter was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  console.log(`PASS verify-driver-load-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkCashAdvances(fs.readFileSync(CASH_ADVANCES_ROUTES, "utf8"));
  checkPod(fs.readFileSync(POD_ROUTES, "utf8"));
  checkEvidence(fs.readFileSync(MATRIX, "utf8"), fs.readFileSync(SELF, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-driver-load-reverse-link-wired — driver->cash-advances and load->POD-documents reverse reads (Wave-B reverse_link/connectivity) confirmed wired.");
  }
}
