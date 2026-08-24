#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.modal.create_work_order"],"task":"MAINTENANCE-WO-AUTHORIZER-READ-FAILURE-TRUTH"}
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/components/CreateWOSectionRenderV5Header.tsx";
const CHECKS = [
  ["query:company-scoped", /queryKey: \["identity", "users", "wo-authorized-by", operatingCompanyId\]/],
  ["query:error-before-select", /usersQuery\.isError \? \([\s\S]{0,500}<SelectCombobox/],
  ["query:visible-failure", /Employees unavailable — retry/],
  ["query:exact-retry", /onClick=\{\(\) => void usersQuery\.refetch\(\)\}/],
  ["query:pending-disabled", /disabled=\{usersQuery\.isPending\}/],
  ["query:pending-copy", /usersQuery\.isPending \? "Loading employees…"/],
  ["field:canonical-id", /register\("authorized_by_user_id"\)/],
];

function problems(source) {
  return CHECKS.filter(([, pattern]) => !pattern.test(source)).map(([id]) => id);
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const missed = [];
  for (const [id, pattern] of CHECKS) {
    const mutated = source.replace(pattern, "__PLANTED_DEFECT__");
    if (!problems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-maintenance-wo-authorizer-read-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
} else {
  const found = problems(source);
  if (found.length) {
    console.error(`verify-maintenance-wo-authorizer-read-failure-truth FAILED:\n${found.map((id) => ` - ${id}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-maintenance-wo-authorizer-read-failure-truth PASS — failed employee reads are visible and retryable before canonical selection");
}
