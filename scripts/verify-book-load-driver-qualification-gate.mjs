#!/usr/bin/env node
// Guard: the REAL booking path (book-load.service.ts) must hard-gate driver
// qualification — deactivated/archived, expired-or-missing CDL, and
// expired-or-missing DOT medical card — for EVERY assigned driver, and BLOCK
// (not warn). Also asserts the pre-dispatch validator fails CLOSED (a thrown
// check becomes a synthetic blocker, and missing CDL / missing medical card are
// hard blocks). These are DOT safety hard-stops; this guard stops silent regression.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_BOOK_LOAD_DQ_GATE_ROOT ?? process.cwd();
const failures = [];

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const bookLoadPath = path.resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const validatorPath = path.resolve(
  ROOT,
  "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts"
);

const bookLoad = readIfExists(bookLoadPath);
if (!bookLoad) {
  failures.push("missing_book_load_service");
} else {
  // The hard gate must exist, block with the canonical code, and inspect all
  // required credential dimensions against mdata.drivers.
  if (!bookLoad.includes("E_DRIVER_NOT_QUALIFIED")) failures.push("missing_driver_not_qualified_block_code");
  if (!bookLoad.includes("dispatch.book_load_blocked_by_driver_qualification"))
    failures.push("missing_driver_qualification_audit_event");
  if (!bookLoad.includes("collectAssignedDriverIdsForDrugGate"))
    failures.push("gate_not_applied_to_all_assigned_drivers");
  if (!/deactivated_at\s+IS NOT NULL/.test(bookLoad)) failures.push("missing_deactivated_check");
  if (!/archived_at\s+IS NOT NULL/.test(bookLoad)) failures.push("missing_archived_check");
  if (!bookLoad.includes("cdl_expires_at")) failures.push("missing_cdl_check");
  if (!bookLoad.includes("dot_medical_expires_at") || !bookLoad.includes("safety.medical_cards"))
    failures.push("missing_medical_card_check");
  // optionalQuery must fail CLOSED on real errors (only skip relation-absent codes).
  if (!bookLoad.includes("RELATION_ABSENT_CODES")) failures.push("optional_query_not_fail_closed");
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
