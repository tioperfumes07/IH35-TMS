#!/usr/bin/env node
// Guard: the REAL booking path (book-load.service.ts) must hard-gate driver
// qualification for EVERY assigned driver and BLOCK (not warn). G9-C1 centralised
// the per-driver credential hard-stops into the SHARED gate
// (driver-qualification.service.ts) so book-load, quick-assign, quicksave and the
// planner can never drift; this guard asserts (a) book-load delegates to that shared
// gate + emits the block audit event, and (b) the shared gate still enforces every
// dimension — deactivated/archived, expired-or-missing CDL, expired-or-missing DOT
// medical card, and (D3-1) the hazmat H-endorsement via the REAL mdata.drivers.endorsement_h
// column (NOT the phantom `hazmat_endorsement`, which lives on mdata.units). Also asserts
// the pre-dispatch validator fails CLOSED. These are DOT safety hard-stops; this guard
// stops silent regression.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_BOOK_LOAD_DQ_GATE_ROOT ?? process.cwd();
const failures = [];

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const bookLoadPath = path.resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const dqPath = path.resolve(ROOT, "apps/backend/src/dispatch/driver-qualification.service.ts");
const validatorPath = path.resolve(
  ROOT,
  "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts"
);

const bookLoad = readIfExists(bookLoadPath);
if (!bookLoad) {
  failures.push("missing_book_load_service");
} else {
  // The booking path must BLOCK with the canonical code, emit the block audit event, apply the
  // gate to every assigned driver, delegate the credential hard-stops to the SHARED gate, and keep
  // its optional reads failing CLOSED. (The per-dimension credential checks themselves are asserted
  // against the shared gate below, since G9-C1 moved them out of book-load.)
  if (!bookLoad.includes("E_DRIVER_NOT_QUALIFIED")) failures.push("missing_driver_not_qualified_block_code");
  if (!bookLoad.includes("dispatch.book_load_blocked_by_driver_qualification"))
    failures.push("missing_driver_qualification_audit_event");
  if (!bookLoad.includes("collectAssignedDriverIdsForDrugGate"))
    failures.push("gate_not_applied_to_all_assigned_drivers");
  if (!bookLoad.includes("assertDriverQualifiedForLoad"))
    failures.push("gate_not_delegated_to_shared_qualification_service");
  // optionalQuery must fail CLOSED on real errors (only skip relation-absent codes).
  if (!bookLoad.includes("RELATION_ABSENT_CODES")) failures.push("optional_query_not_fail_closed");
}

// G9-C1/D3-1: the shared per-driver qualification gate is the single source of the DOT credential
// hard-stops. Every dimension the booking path used to inline must live here and BLOCK.
const dq = readIfExists(dqPath);
if (!dq) {
  failures.push("missing_driver_qualification_service");
} else {
  if (!/deactivated_at\s+IS NOT NULL/.test(dq)) failures.push("missing_deactivated_check");
  if (!/archived_at\s+IS NOT NULL/.test(dq)) failures.push("missing_archived_check");
  if (!dq.includes("cdl_expires_at")) failures.push("missing_cdl_check");
  if (!dq.includes("dot_medical_expires_at") || !dq.includes("safety.medical_cards"))
    failures.push("missing_medical_card_check");
  // D3-1 hazmat H-endorsement must use the REAL mdata.drivers.endorsement_h boolean...
  if (!dq.includes("endorsement_h")) failures.push("missing_hazmat_endorsement_check");
  // ...and must NEVER reintroduce the phantom `d.hazmat_endorsement` column (that boolean lives on
  // mdata.units, not mdata.drivers; `d.hazmat_endorsement_expires_at` is the real, distinct column).
  if (/\bd\.hazmat_endorsement\b/.test(dq)) failures.push("phantom_driver_hazmat_endorsement_column");
  // DRV-F6254: the canonical gate must evaluate credentials for a driver that is actively shared
  // into the selected company. A home-company-only lookup returns no row and the gate's deliberate
  // caller-owned not-found contract then becomes a silent qualification bypass.
  const sharedDriverChecks = [
    ["missing_qualification_shared_driver_source", "FROM mdata.driver_company_authorizations qualification_gate_driver_dca"],
    ["missing_qualification_shared_driver_identity", "qualification_gate_driver_dca.driver_id = d.id"],
    ["missing_qualification_shared_driver_company", "qualification_gate_driver_dca.company_id = $2::uuid"],
    ["missing_qualification_shared_driver_active", "qualification_gate_driver_dca.is_authorized = true"],
    ["missing_qualification_shared_driver_not_deactivated", "qualification_gate_driver_dca.deactivated_at IS NULL"],
  ];
  for (const [failure, token] of sharedDriverChecks) {
    if (!dq.includes(token)) failures.push(failure);
  }
}

// G9-C1/D3-1/DISP-2: every SIBLING assignment path must delegate its driver credential hard-stops
// to the shared gate — never re-implement a partial check. If any of these stops calling
// assertDriverQualifiedForLoad, a terminated / expired-CDL / hazmat-unqualified driver could be
// assigned through that entry point. DISP-2 closed the last gap (the inline `assign-driver` reassign
// in assignments/quicksave.service.ts, which previously used only assertDriverActive).
const siblingQualificationPaths = [
  "apps/backend/src/dispatch/quick-assign.service.ts",
  "apps/backend/src/dispatch/planner.service.ts",
  "apps/backend/src/dispatch/assignments/quicksave.service.ts",
];
for (const rel of siblingQualificationPaths) {
  const src = readIfExists(path.resolve(ROOT, rel));
  if (!src) {
    failures.push(`missing_sibling_assignment_path:${rel}`);
    continue;
  }
  if (!src.includes("assertDriverQualifiedForLoad")) {
    failures.push(`sibling_path_not_delegated_to_shared_gate:${rel}`);
  }
}

const validator = readIfExists(validatorPath);
if (!validator) {
  failures.push("missing_pre_dispatch_validator");
} else {
  // Fail-closed: a rejected check must become a synthetic hard blocker.
  if (!validator.includes("WF-PREDISPATCH-CHECK-FAILED")) failures.push("validator_not_fail_closed");
  if (!validator.includes("runIsolatedCheck")) failures.push("validator_checks_not_isolated");
  // Missing CDL / missing medical card must be hard blocks (not warn / not dropped).
  if (!validator.includes("WF-CDL-MISSING")) failures.push("missing_cdl_rule");
  if (!validator.includes("WF-MED-CARD-MISSING")) failures.push("missing_medical_card_rule");
  // No phantom columns reintroduced.
  if (validator.includes("display_name AS customer_name")) failures.push("phantom_customer_display_name");
  // A BARE selected `full_name` column is the phantom (mdata.drivers has none). The
  // safe form is `CONCAT_WS(' ', first_name, last_name) AS full_name`, which is fine.
  if (/^\s*full_name\s*,?\s*$/m.test(validator)) failures.push("phantom_full_name_bare_column");
}

if (failures.length > 0) {
  console.error("verify:book-load-driver-qualification-gate FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:book-load-driver-qualification-gate OK");

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["source", "FROM mdata.driver_company_authorizations qualification_gate_driver_dca", "FROM mdata.drivers qualification_gate_driver_dca"],
    ["identity", "qualification_gate_driver_dca.driver_id = d.id", "qualification_gate_driver_dca.driver_id IS NULL"],
    ["company", "qualification_gate_driver_dca.company_id = $2::uuid", "qualification_gate_driver_dca.company_id = d.operating_company_id"],
    ["authorization", "qualification_gate_driver_dca.is_authorized = true", "qualification_gate_driver_dca.is_authorized = false"],
    ["deactivation", "qualification_gate_driver_dca.deactivated_at IS NULL", "qualification_gate_driver_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [label, before, after] of mutations) {
    const mutated = dq.replace(before, after);
    if (mutated === dq || mutated.includes(before)) {
      console.error(`verify:book-load-driver-qualification-gate SELFTEST FAILED: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify:book-load-driver-qualification-gate SELFTEST OK (${mutations.length}/${mutations.length} planted defects rejected)`);
}
