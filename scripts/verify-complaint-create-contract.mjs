#!/usr/bin/env node
/**
 * P1 `complaint_consistency_failed` — the complaints create form must POST the CONTRACT, not its own state.
 *
 * `POST /api/v1/safety/complaints` rejects with `complaint_consistency_failed` unless BOTH hold
 * (routes/safety/complaints.ts validateConsistency, mirroring the DB CHECK in migration 0051):
 *   complainant: driver->complainant_driver_id · employee->complainant_user_id ·
 *                customer->complainant_customer_id · external->complainant_external_name · anonymous->none
 *   respondent : driver->respondent_driver_id (and NO respondent_user_id)
 *
 * The page previously posted its raw form: `respondent_uuid`, `complaint_type_uuid`, no complainant id at
 * all. `complaint_type` is REQUIRED by zod and was never sent, and the complainant dropdown offered five
 * types while the payload only ever carried a name — so "from Jorge" (a DRIVER complainant) could not be
 * filed. Every create from this page failed.
 *
 *   node scripts/verify-complaint-create-contract.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-complaint-create-contract";
const PAGE = "apps/frontend/src/pages/safety/ComplaintsPage.tsx";

function assert(files) {
  const p = files[PAGE] ?? "";
  const problems = [];
  // Contract field names — the old ones are the bug, so their ABSENCE is part of the assertion.
  if (/respondent_uuid|complaint_type_uuid/.test(p)) {
    problems.push(`${PAGE}: still uses respondent_uuid/complaint_type_uuid — the endpoint takes respondent_driver_id/complaint_type`);
  }
  if (!/respondent_driver_id:\s*form\.respondent_driver_id/.test(p)) {
    problems.push(`${PAGE}: payload must send respondent_driver_id`);
  }
  if (!/complaint_type:\s*form\.complaint_type/.test(p)) {
    problems.push(`${PAGE}: payload must send complaint_type (REQUIRED by the zod schema)`);
  }
  // The complainant id must follow the selected type, or non-external complainants can never be filed.
  if (!/complainant_driver_id/.test(p) || !/complainant_user_id/.test(p) || !/complainant_customer_id/.test(p)) {
    problems.push(`${PAGE}: complainant identity must cover driver/employee/customer, not just external`);
  }
  if (!/\[complainantIdentityKey\]/.test(p)) {
    problems.push(`${PAGE}: payload must send the identity key for the SELECTED complainant_type`);
  }
  // filed_at is .datetime(); complaint_date is a plain date. Posting the raw form fails zod on that alone.
  if (/createComplaint\(operatingCompanyId,\s*form\)/.test(p)) {
    problems.push(`${PAGE}: must not POST the raw form (complaint_date is not a filed_at datetime)`);
  }
  return problems;
}

const files = Object.fromEntries([PAGE].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    ["reverted to raw form post", { [PAGE]: files[PAGE].replace(/createComplaint\(operatingCompanyId, \{[\s\S]*?\}\),/, "createComplaint(operatingCompanyId, form),") }],
    ["complaint_type dropped", { [PAGE]: files[PAGE].replace(/complaint_type:\s*form\.complaint_type,/, "") }],
    ["respondent_driver_id dropped", { [PAGE]: files[PAGE].replace(/respondent_driver_id:\s*form\.respondent_driver_id,/, "") }],
    ["complainant identity collapsed to external", { [PAGE]: files[PAGE].replace(/complainant_driver_id/g, "x_removed") }],
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
console.log(`${LABEL}: OK — complaints create posts the server contract (typed complainant id + respondent_driver_id + complaint_type)`);
process.exit(0);
