#!/usr/bin/env node
/**
 * P1 `complaint_consistency_failed` — complaints create forms must POST the CONTRACT, not raw state.
 *
 * `POST /api/v1/safety/complaints` rejects with `complaint_consistency_failed` unless BOTH hold
 * (routes/safety/complaints.ts validateConsistency, mirroring the DB CHECK in migration 0051):
 *   complainant: driver->complainant_driver_id · employee->complainant_user_id ·
 *                customer->complainant_customer_id · external->complainant_external_name · anonymous->none
 *   respondent : driver->respondent_driver_id (and NO respondent_user_id)
 *                employee->respondent_user_id (and NO respondent_driver_id)
 *
 * LIVE path is `tabs/ComplaintsTab.tsx` (`/safety/complaints`). Archived `ComplaintsPage.tsx` stays
 * contract-correct (ARCHIVE-not-DELETE) so a remount cannot revive the raw-form bug.
 *
 *   node scripts/verify-complaint-create-contract.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-complaint-create-contract";
const LIVE = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
const ARCHIVED = "apps/frontend/src/pages/safety/ComplaintsPage.tsx";
const PAGES = [LIVE, ARCHIVED];

function assertPage(rel, src) {
  const problems = [];
  if (/respondent_uuid|complaint_type_uuid/.test(src)) {
    problems.push(`${rel}: still uses respondent_uuid/complaint_type_uuid — the endpoint takes respondent_driver_id/complaint_type`);
  }
  if (!/complaint_type:\s*form\.complaint_type/.test(src) && !/complaint_type:\s*form\.complaint_type,/.test(src)) {
    if (!/complaint_type:\s*form\.complaint_type/.test(src)) {
      problems.push(`${rel}: payload must send complaint_type (REQUIRED by the zod schema)`);
    }
  }
  if (!/complainant_driver_id/.test(src) || !/complainant_user_id/.test(src) || !/complainant_customer_id/.test(src)) {
    problems.push(`${rel}: complainant identity must cover driver/employee/customer, not just external`);
  }
  if (!/\[complainantIdentityKey\]/.test(src)) {
    problems.push(`${rel}: payload must send the identity key for the SELECTED complainant_type`);
  }
  // Live tab builds body then createComplaintV64; archived page uses createComplaint({...}).
  if (rel === ARCHIVED) {
    if (!/respondent_driver_id:\s*form\.respondent_driver_id/.test(src)) {
      problems.push(`${rel}: payload must send respondent_driver_id`);
    }
    if (/createComplaint\(operatingCompanyId,\s*form\)/.test(src)) {
      problems.push(`${rel}: must not POST the raw form (complaint_date is not a filed_at datetime)`);
    }
  } else {
    // Live path: respondent may be driver OR employee; both ids must exist in source.
    if (!/respondent_driver_id/.test(src) || !/respondent_user_id/.test(src)) {
      problems.push(`${rel}: respondent must support driver_id AND user_id (backend respondent_type enum)`);
    }
    if (!/complainant_type:\s*["']external["']/.test(src) && !/complainant_type:\s*"external"\s*as/.test(src)) {
      // form default may be typed; require type selector options instead
      if (!/value="driver"/.test(src) || !/value="employee"/.test(src) || !/value="customer"/.test(src)) {
        problems.push(`${rel}: complainant_type selector must offer driver/employee/customer (not hardcoded external-only)`);
      }
    } else if (!/value="driver"/.test(src) || !/value="employee"/.test(src) || !/value="customer"/.test(src)) {
      problems.push(`${rel}: complainant_type selector must offer driver/employee/customer (not hardcoded external-only)`);
    }
    if (!/listAssignableUsers/.test(src)) {
      problems.push(`${rel}: employee complainant/respondent must use listAssignableUsers (not raw UUID)`);
    }
  }
  return problems;
}

function assert(files) {
  return PAGES.flatMap((rel) => assertPage(rel, files[rel] ?? ""));
}

const files = Object.fromEntries(PAGES.map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    [
      "live complainant identity collapsed",
      { ...files, [LIVE]: files[LIVE].replace(/complainant_driver_id/g, "x_removed") },
    ],
    [
      "live complainant types collapsed to external-only",
      {
        ...files,
        [LIVE]: files[LIVE]
          .replace(/value="driver"/g, 'value="x"')
          .replace(/value="employee"/g, 'value="y"')
          .replace(/value="customer"/g, 'value="z"'),
      },
    ],
    [
      "archived raw form post",
      {
        ...files,
        [ARCHIVED]: files[ARCHIVED].replace(
          /createComplaint\(operatingCompanyId, \{[\s\S]*?\}\),/,
          "createComplaint(operatingCompanyId, form),"
        ),
      },
    ],
    [
      "archived complaint_type dropped",
      { ...files, [ARCHIVED]: files[ARCHIVED].replace(/complaint_type:\s*form\.complaint_type,/, "") },
    ],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — live ComplaintsTab + archived ComplaintsPage post typed complainant/respondent contract`
);
process.exit(0);
