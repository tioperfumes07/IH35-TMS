#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["reverse_link"],"leafRe":"^hop\.daily_tasks$","task":"LINK-F5126-USER-REVERSE-DETAILS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["users"],"cols":["reverse_link"],"leafRe":"^detail$","task":"LINK-F5126-USER-REVERSE-DETAILS","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  auditCard: fs.readFileSync("apps/frontend/src/components/audit/AuditEventCard.tsx", "utf8"),
  tasks: fs.readFileSync("apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx", "utf8"),
  users: fs.readFileSync("apps/frontend/src/pages/UserDetail.tsx", "utf8"),
  usersRoute: fs.readFileSync("apps/backend/src/identity/users.routes.ts", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["auditCard", /event\.actor_user_id \? <>\{" · "\}<EntityLink kind="user" id=\{event\.actor_user_id\}/, "audit detail card actor drills to user"],
  ["tasks", /Actor: <EntityLink kind="user" id=\{event\.actor_user_id\}/, "daily-task event actor drills to user"],
  ["users", /VOIDED on[\s\S]*?kind="user" id=\{event\.voided_by_user_id\}/, "user lifecycle void actor drills to user"],
  ["entityLink", /case "user":[\s\S]*?return `\/users\/\$\{id\}`/, "user resolver targets mounted user profile"],
  ["usersRoute", /d\.identity_user_id = \$1[\s\S]{0,500}user_detail_dca\.driver_id = d\.id[\s\S]{0,180}user_detail_dca\.company_id = \$2::uuid[\s\S]{0,180}user_detail_dca\.is_authorized = true[\s\S]{0,180}user_detail_dca\.deactivated_at IS NULL/, "user detail recognizes active company-authorized shared driver record"],
];

const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) {
  console.error(`verify-user-reverse-link-detail-sweep: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-user-reverse-link-detail-sweep: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-user-reverse-link-detail-sweep: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-user-reverse-link-detail-sweep: PASS — ${checks.length} user detail reverse-link invariants`);
