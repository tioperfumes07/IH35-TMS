#!/usr/bin/env node
// FD1 CI guard — the internal-fines creator must stay wired.
// Regressions this catches:
//   1. Driver picker reverts to a dead text input (no listDrivers) → no driver_uuid can be produced.
//   2. Reason picker stops consuming the internal-fine-reasons catalog → no reason_uuid.
//   3. The disabled create button becomes a silent dead control (no helper text explaining why).
//   4. The backend drops the approver_required validation on approved fines (approval creates a
//      recoverable driver liability — the approver must be identified in the audit trail).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

const creatorPath = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const backendPath = "apps/backend/src/safety/safety-v5.routes.ts";

const creator = read(creatorPath);
const backend = read(backendPath);

if (!creator) failures.push(`missing:${creatorPath}`);
if (!backend) failures.push(`missing:${backendPath}`);

// FIX 1 — pickers wired.
if (creator && !creator.includes("listDrivers")) failures.push("frontend_missing_listDrivers_import");
if (creator && !creator.includes("listInternalFineReasons")) failures.push("frontend_missing_internal_fine_reasons_catalog_fetch");
// The pickers must store the resolved uuids (not raw text) so the create button can ever enable.
if (creator && !creator.includes("driver_uuid")) failures.push("frontend_missing_driver_uuid_binding");
if (creator && !creator.includes("reason_uuid")) failures.push("frontend_missing_reason_uuid_binding");

// FIX 2 — no silent dead control: helper text must exist for the disabled state.
if (creator && !creator.includes("Select a driver and a reason")) failures.push("frontend_missing_disabled_helper_text");

// FIX 3 — backend approver_required validation on approved fines.
if (backend && !backend.includes("approver_required")) failures.push("backend_missing_approver_required_validation");
if (backend && !/status\s*===\s*"approved"\s*&&\s*!body\.data\.approved_by_user_uuid/.test(backend)) {
  failures.push("backend_missing_approver_required_condition");
}

if (failures.length > 0) {
  console.error("verify:internal-fines-creator FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:internal-fines-creator OK");
