#!/usr/bin/env node
/**
 * USER-S02 — Change role ceremony requires approver when policy demands.
 * Static ratchet (no verify-steps / CLAIMED — Rule 37; same pattern as verify-fact-s0*).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-s02-role-approver";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/Users.tsx";
const TEST = "apps/frontend/src/pages/Users.test.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const src = read(PAGE);
  const testSrc = read(TEST);

  if (!src.includes("roleRequiresApprover")) problems.push("roleRequiresApprover missing");
  if (!src.includes('roleChangeRole === "Owner" || roleChangeRole === "Administrator"')) {
    problems.push("Owner/Administrator policy gate missing");
  }
  if (!src.includes("required_approver_user_id")) problems.push("required_approver_user_id not in payload");
  if (!src.includes('data-testid="user-role-required-approver"')) {
    problems.push("user-role-required-approver testid missing");
  }
  if (!src.includes("Select an approver for this role change")) {
    problems.push("missing approver-required toast");
  }
  if (!src.includes("disabled={roleRequiresApprover && !roleApproverId}")) {
    problems.push("submit not disabled without approver");
  }
  if (!src.includes("user.id !== roleModalUser?.id") || !src.includes("user.id !== auth.user?.uuid")) {
    problems.push("approver options must exclude target and requester");
  }
  if (!src.includes("createIdentityWorkflow")) problems.push("createIdentityWorkflow missing");

  if (!testSrc.includes("requires a distinct approver for policy-sensitive role changes")) {
    problems.push("Users.test missing USER-S02 ceremony test");
  }
  if (!testSrc.includes("required_approver_user_id")) {
    problems.push("Users.test must assert required_approver_user_id payload");
  }
  if (!testSrc.includes("createIdentityWorkflowMock")) {
    problems.push("Users.test must mock createIdentityWorkflow");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace("required_approver_user_id", "approver_user_id_REMOVED"));
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
