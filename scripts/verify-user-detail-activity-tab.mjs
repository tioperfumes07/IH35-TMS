#!/usr/bin/env node
/**
 * 0441-mod11-user-detail-activity-tab-stub
 *
 * User detail Activity tab must query audit.audit_events via /api/v1/audit/events-list
 * filtered by actor (user UUID) — not a static placeholder.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:user-detail-activity-tab";

const paths = {
  userActivityTab: path.join(ROOT, "apps/frontend/src/components/users/UserActivityTab.tsx"),
  userDetail: path.join(ROOT, "apps/frontend/src/pages/UserDetail.tsx"),
  auditApi: path.join(ROOT, "apps/frontend/src/api/audit.ts"),
  auditEventsListRoutes: path.join(ROOT, "apps/backend/src/audit/audit-events-list.routes.ts"),
};

const STUB_COPY = "User activity history will appear here once audit exports are enabled";

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {{ userActivityTab: string; userDetail: string; auditApi: string; auditEventsListRoutes: string }} sources */
export function collectFailures({ userActivityTab, userDetail, auditApi, auditEventsListRoutes }) {
  const failures = [];

  if (!userActivityTab.includes("0441-mod11")) {
    failures.push("UserActivityTab must reference block id 0441-mod11");
  }
  if (!userActivityTab.includes('data-testid="user-activity-tab"')) {
    failures.push("UserActivityTab must expose user-activity-tab test id");
  }
  if (!userActivityTab.includes("listAuditEvents")) {
    failures.push("UserActivityTab must call listAuditEvents");
  }
  if (!userActivityTab.includes("actor: userId")) {
    failures.push("UserActivityTab must filter audit events by actor userId");
  }
  if (!userDetail.includes("<UserActivityTab")) {
    failures.push("UserDetail must render UserActivityTab on activity tab");
  }
  if (userDetail.includes(STUB_COPY)) {
    failures.push("UserDetail must not retain activity tab placeholder copy");
  }
  if (!auditApi.includes("/api/v1/audit/events-list")) {
    failures.push("Frontend audit API must expose /api/v1/audit/events-list");
  }
  if (!auditApi.includes("actor")) {
    failures.push("listAuditEvents params must support actor filter");
  }
  if (!auditEventsListRoutes.includes("/api/v1/audit/events-list")) {
    failures.push("Backend must mount GET /api/v1/audit/events-list");
  }
  if (!auditEventsListRoutes.includes("audit.audit_events")) {
    failures.push("events-list route must query audit.audit_events");
  }

  return failures;
}

function selftest() {
  const good = collectFailures({
    userActivityTab: read(paths.userActivityTab),
    userDetail: read(paths.userDetail),
    auditApi: read(paths.auditApi),
    auditEventsListRoutes: read(paths.auditEventsListRoutes),
  });
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass before selftest`);
    process.exit(1);
  }

  const planted = collectFailures({
    userActivityTab: read(paths.userActivityTab).replace("actor: userId", "actor: undefined"),
    userDetail: read(paths.userDetail),
    auditApi: read(paths.auditApi),
    auditEventsListRoutes: read(paths.auditEventsListRoutes),
  });
  if (!planted.some((f) => f.includes("actor userId"))) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted violation`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures({
    userActivityTab: read(paths.userActivityTab),
    userDetail: read(paths.userDetail),
    auditApi: read(paths.auditApi),
    auditEventsListRoutes: read(paths.auditEventsListRoutes),
  });

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — User detail Activity tab wired to audit spine`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
