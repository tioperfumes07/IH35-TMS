#!/usr/bin/env node
// Locks the fix for finding G1-1 (LIVE-EXPLOITABLE privilege escalation, audit 2026-07-04):
// PATCH /identity/users/:id was gated only by isAdminRole, so any Administrator could set role=Owner on
// themselves or anyone. The fix adds anti-escalation guards. This guard fails if any of them is removed.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FILE = "apps/backend/src/identity/users.routes.ts";
const TAG = "[verify-user-role-escalation-guard]";
const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");

const required = [
  { key: "owner-only owner assignment", re: /owner_role_requires_owner/ },
  { key: "no self-role-change", re: /cannot_change_own_role/ },
  { key: "last-owner guard", re: /cannot_demote_last_owner/ },
  { key: "caller-is-owner check", re: /authUser\.role\s*===\s*"Owner"/ },
];
const missing = required.filter((r) => !r.re.test(src));
if (missing.length) {
  console.error(`${TAG} FAIL: ${FILE} lost G1-1 anti-escalation guard(s): ${missing.map((m) => m.key).join(", ")}`);
  process.exit(1);
}
console.log(`${TAG} OK — role-escalation guards present (owner-only, no-self-change, last-owner).`);
