#!/usr/bin/env node
/**
 * verify-driver-qualification-gate-shared.mjs
 *
 * CI guard for G9-C1 + D3-1: the DOT driver-qualification gate must live in ONE shared module
 * (dispatch/driver-qualification.service.ts) and EVERY assignment path must call it, so the rules
 * (deactivated / archived / expired-CDL / expired-medical) can never drift between entry points —
 * and the hazmat H-endorsement (D3-1) is enforced everywhere.
 *
 * Fails if:
 *   - the shared module is missing, or does not export `assertDriverQualifiedForLoad`, or lacks the
 *     hazmat branch (`endorsement_h` + `hazmat_endorsement_expires_at` + reason `hazmat_endorsement_missing`);
 *   - book-load / quick-assign / quicksave / planner do NOT reference the shared gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch");
const SHARED_FN = "assertDriverQualifiedForLoad";
const SHARED_FILE = "driver-qualification.service.ts";

function read(rel) {
  const p = path.join(DISPATCH, rel);
  if (!fs.existsSync(p)) {
    return { missing: true, src: "" };
  }
  return { missing: false, src: fs.readFileSync(p, "utf8") };
}

function check() {
  const errors = [];

  // 1. Shared module exists, exports the gate, and carries the hazmat branch.
  const shared = read(SHARED_FILE);
  if (shared.missing) {
    errors.push(`MISSING FILE: apps/backend/src/dispatch/${SHARED_FILE}`);
  } else {
    if (!new RegExp(`export\\s+async\\s+function\\s+${SHARED_FN}\\b`).test(shared.src)) {
      errors.push(`driver-qualification.service.ts must export async function ${SHARED_FN}`);
    }
    // D3-1 hazmat branch: the H-endorsement columns must be read AND the reason emitted.
    // The canonical driver-side hazmat flag is mdata.drivers.endorsement_h (migration 0301);
    // mdata.drivers.hazmat_endorsement does not exist.
    if (!shared.src.includes("endorsement_h")) {
      errors.push("driver-qualification.service.ts must reference mdata.drivers.endorsement_h (D3-1 hazmat branch missing)");
    }
    if (!shared.src.includes("hazmat_endorsement_expires_at")) {
      errors.push("driver-qualification.service.ts must reference mdata.drivers.hazmat_endorsement_expires_at (D3-1 expiry check missing)");
    }
    if (!shared.src.includes("hazmat_endorsement_missing")) {
      errors.push('driver-qualification.service.ts must emit reason "hazmat_endorsement_missing" (D3-1)');
    }
    // Preserve the original book-load credential reasons in the shared gate.
    for (const reason of ["driver_deactivated", "driver_archived", "cdl_missing", "cdl_expired", "medical_card_missing", "medical_card_expired"]) {
      if (!shared.src.includes(reason)) {
        errors.push(`driver-qualification.service.ts must preserve reason "${reason}"`);
      }
    }
  }

  // 2. Every assignment path must reference the shared gate function.
  const CALLERS = [
    "book-load.service.ts",
    "quick-assign.service.ts", // the quicksave / drag-drop assignment path
    "planner.service.ts",
  ];
  for (const rel of CALLERS) {
    const { missing, src } = read(rel);
    if (missing) {
      errors.push(`MISSING FILE: apps/backend/src/dispatch/${rel}`);
      continue;
    }
    if (!src.includes(SHARED_FN)) {
      errors.push(`${rel} must call the shared gate ${SHARED_FN}() — path is not enforcing driver qualification`);
    }
  }

  return errors;
}

function selftest() {
  const p = path.join(DISPATCH, SHARED_FILE);
  const backup = fs.readFileSync(p, "utf8");
  try {
    const planted = backup
      .replace(/endorsement_h/g, "ENDORSEMENT_H_REMOVED")
      .replace(/hazmat_endorsement_expires_at/g, "HAZMAT_EXPIRY_REMOVED");
    fs.writeFileSync(p, planted, "utf8");
    const plantedErrors = check();
    if (!plantedErrors.some((e) => e.includes("endorsement_h") || e.includes("hazmat_endorsement_expires_at"))) {
      throw new Error("selftest expected planted hazmat column removal to be detected");
    }
    console.log(`verify-driver-qualification-gate-shared: SELFTEST PASS (${plantedErrors.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(p, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = check();
  if (errors.length > 0) {
    console.error("verify-driver-qualification-gate-shared: FAIL");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-driver-qualification-gate-shared: OK — shared gate present with hazmat branch; book-load, quick-assign, and planner all enforce it.");
}

main();
