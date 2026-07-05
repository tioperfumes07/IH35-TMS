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
 *     hazmat branch (`hazmat_endorsement` + reason `hazmat_endorsement_missing`);
 *   - book-load / quick-assign / quicksave / planner do NOT reference the shared gate.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch");
const SHARED_FN = "assertDriverQualifiedForLoad";

const errors = [];

function read(rel) {
  const p = path.join(DISPATCH, rel);
  if (!fs.existsSync(p)) {
    errors.push(`MISSING FILE: apps/backend/src/dispatch/${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// 1. Shared module exists, exports the gate, and carries the hazmat branch.
const shared = read("driver-qualification.service.ts");
if (shared) {
  if (!new RegExp(`export\\s+async\\s+function\\s+${SHARED_FN}\\b`).test(shared)) {
    errors.push(`driver-qualification.service.ts must export async function ${SHARED_FN}`);
  }
  // D3-1 hazmat branch: the endorsement column must be read AND the reason emitted.
  if (!shared.includes("hazmat_endorsement")) {
    errors.push("driver-qualification.service.ts must reference mdata.drivers.hazmat_endorsement (D3-1 hazmat branch missing)");
  }
  if (!shared.includes("hazmat_endorsement_missing")) {
    errors.push('driver-qualification.service.ts must emit reason "hazmat_endorsement_missing" (D3-1)');
  }
  // Preserve the original book-load credential reasons in the shared gate.
  for (const reason of ["driver_deactivated", "driver_archived", "cdl_missing", "cdl_expired", "medical_card_missing", "medical_card_expired"]) {
    if (!shared.includes(reason)) {
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
  const src = read(rel);
  if (src && !src.includes(SHARED_FN)) {
    errors.push(`${rel} must call the shared gate ${SHARED_FN}() — path is not enforcing driver qualification`);
  }
}

if (errors.length > 0) {
  console.error("verify-driver-qualification-gate-shared: FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify-driver-qualification-gate-shared: OK — shared gate present with hazmat branch; book-load, quick-assign, and planner all enforce it.");
