#!/usr/bin/env node
/** @matrix-built {"modules":["docs"],"cols":["reverse_link"],"leafRe":"^(table\.entity_link|docs\.modal\.(preview|version_history))$","task":"LINK-F5125-USER-REVERSE-VERTICAL","vertical":"class-sweep"} */
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^audit\.activity_by_user$","task":"LINK-F5125-USER-REVERSE-VERTICAL","vertical":"class-sweep"} */
/** @matrix-built {"modules":["tasks"],"cols":["reverse_link"],"leafRe":"^hop\.daily_tasks$","task":"LINK-F5125-USER-REVERSE-VERTICAL","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leafRe":"^complaints\.list$","task":"LINK-F5125-USER-REVERSE-VERTICAL","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^profiles\.detail$","task":"LINK-F5125-USER-REVERSE-VERTICAL","vertical":"class-sweep"} */

import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sources = {
  versions: read("apps/frontend/src/components/documents/VersionHistoryModal.tsx"),
  documents: read("apps/frontend/src/components/documents/DocumentsTab.tsx"),
  preview: read("apps/frontend/src/components/documents/PreviewModal.tsx"),
  auditTrail: read("apps/frontend/src/pages/audit/AuditTrailPage.tsx"),
  auditList: read("apps/frontend/src/pages/audit/AuditEventsList.tsx"),
  auditReport: read("apps/frontend/src/pages/reports/audit/AuditReportPage.tsx"),
  dailyTasks: read("apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx"),
  activity: read("apps/frontend/src/pages/admin/ActivityLogPage.tsx"),
  auditViewer: read("apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx"),
  entityAudit: read("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx"),
  driverAudit: read("apps/frontend/src/components/drivers/AuditHistoryTab.tsx"),
  complaints: read("apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx"),
  entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
};

const checks = [
  ["versions", /kind="user" id=\{version\.uploader_user_id\}/, "document version uploader drills to user"],
  ["documents", /kind="user" id=\{row\.uploader_user_id\}/, "document table uploader drills to user"],
  ["preview", /kind="user" id=\{file\.uploader_user_id\}/, "document preview uploader drills to user"],
  ["auditTrail", /kind="user" id=\{row\.actor_user_id\}/, "audit trail actor drills to user"],
  ["auditList", /kind="user" id=\{row\.actor_user_id\}/, "audit event actor drills to user"],
  ["auditReport", /kind="user" id=\{row\.actor_user_id\}/, "audit report actor drills to user"],
  ["dailyTasks", /UserRound[\s\S]*?kind="user" id=\{task\.assigned_to_user_id\}/, "daily-task list assignee drills to user"],
  ["dailyTasks", /Assignee: <EntityLink kind="user" id=\{task\.assigned_to_user_id\}/, "daily-task detail assignee drills to user"],
  ["activity", /kind="user" id=\{row\.actor_user_id\}/, "admin activity actor drills to user"],
  ["auditViewer", /kind="user" id=\{row\.actor_user_id\}/, "admin audit viewer actor drills to user"],
  ["entityAudit", /kind="user" id=\{row\.actor_user_id\}/, "entity audit actor drills to user"],
  ["driverAudit", /kind="user" id=\{row\.actor_user_id\}/, "driver audit actor drills to user"],
  ["complaints", /kind="user" id=\{String\(row\.complainant_user_id\)\}/, "complaint employee complainant drills to user"],
  ["complaints", /kind="user" id=\{String\(row\.respondent_user_id\)\}/, "complaint employee respondent drills to user"],
  ["entityLink", /case "user":[\s\S]*?return `\/users\/\$\{id\}`/, "user resolver targets mounted user profile"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-user-reverse-link-vertical-sweep: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-user-reverse-link-vertical-sweep: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-user-reverse-link-vertical-sweep: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-user-reverse-link-vertical-sweep: PASS — ${checks.length} user reverse-link invariants`);
