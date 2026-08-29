#!/usr/bin/env node
/**
 * USER-S02-BACKEND — the "Change Role" approver ceremony must be enforced server-side, not just
 * in the browser. Live-found 2026-08-29 (CC-3, users module L6 re-verify): a real
 * identity.workflow_requests row (action_code WF-064-IDENT-002, new_role=Owner, id
 * 804ee2ae-74db-4d20-a878-93cc4aeaa16e, created 2026-07-21) has NO required_approver_user_id in
 * its payload at all. That specific row predates the frontend ceremony (added #5346, 2026-08-09)
 * so it is not itself a live bypass -- but tracing the backend
 * (apps/backend/src/identity/workflow-routes.ts) showed the CURRENT code still trusted the
 * frontend completely: createBodySchema never required required_approver_user_id, and
 * POST .../:id/approve never checked the deciding user against it. Anyone with API access
 * (bypassing the UI entirely) could create a Pending Owner/Administrator role-change request with
 * no named approver, and any admin-role user (not just the named approver) could approve it.
 *
 * Static ratchet (no verify-steps / CLAIMED -- Rule 37; same pattern as verify-user-s02-role-approver).
 * Asserts the backend route file requires and enforces required_approver_user_id for
 * Owner/Administrator WF-064-IDENT-002 requests at BOTH create-time and approve-time.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-s02-role-approver-backend-enforced";
const SELFTEST = process.argv.includes("--selftest");
const TARGET = "apps/backend/src/identity/workflow-routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const src = read(TARGET);

  if (!/function roleRequiresApprover/.test(src)) {
    problems.push("roleRequiresApprover helper missing");
  }
  if (!/role === "Owner" \|\| role === "Administrator"/.test(src)) {
    problems.push("Owner/Administrator policy gate missing from roleRequiresApprover");
  }
  if (!/function extractRequiredApproverId/.test(src)) {
    problems.push("extractRequiredApproverId helper missing");
  }
  // Create-time: reject a missing approver for an admin-level role change.
  if (!/role_change_requires_approver/.test(src)) {
    problems.push("create handler never rejects a missing approver (role_change_requires_approver)");
  }
  if (!/role_change_approver_cannot_be_target/.test(src) || !/role_change_approver_cannot_be_requester/.test(src)) {
    problems.push("create handler doesn't exclude target/requester as their own approver");
  }
  if (!/role_change_approver_not_eligible/.test(src)) {
    problems.push("create handler never validates the named approver is an active admin-role user");
  }
  // Approve-time: only the named approver may decide an admin-level role change.
  if (!/role_change_missing_approver/.test(src)) {
    problems.push("approve handler never blocks a legacy/missing-approver request from being approved");
  }
  if (!/role_change_wrong_approver/.test(src) || !/requiredApproverId !== authUser\.uuid/.test(src)) {
    problems.push("approve handler never checks the deciding user against required_approver_user_id");
  }
  if (!/result\.error === "role_change_wrong_approver"/.test(src)) {
    problems.push("role_change_wrong_approver isn't mapped to a 403 (approver mismatch is authorization, not a 400 validation shape)");
  }

  return problems;
}

function selftest() {
  const original = read(TARGET);
  let mutated = original.replace(
    /if \(roleRequiresApprover\(toRole\)\) \{[\s\S]*?\n {10}\}\n {10}await client\.query\(\s*`UPDATE identity\.users SET role/,
    "await client.query(\n            `UPDATE identity.users SET role"
  );
  if (mutated === original) {
    console.error(`FAIL(selftest setup): could not plant the approve-time-enforcement defect in ${TARGET}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, TARGET), mutated);
  const problemsWithDefect = assertLive();
  fs.writeFileSync(path.join(ROOT, TARGET), original);
  if (problemsWithDefect.length === 0) {
    console.error(`FAIL(selftest): planted defect (removed approve-time approver enforcement) did not turn the guard red`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — planted defect correctly reddened: ${problemsWithDefect[problemsWithDefect.length - 1]}`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = assertLive();
if (problems.length > 0) {
  console.error(`FAIL: ${LABEL}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Owner/Administrator role-change requests require + enforce a named approver server-side, not just in the browser`);
