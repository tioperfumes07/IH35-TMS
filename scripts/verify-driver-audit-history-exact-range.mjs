#!/usr/bin/env node
import fs from "node:fs";

let source = fs.readFileSync("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/audit.ts", "utf8");
const service = fs.readFileSync("apps/backend/src/audit/driver-events.service.ts", "utf8");

if (process.argv.includes("--selftest")) {
  source = source.replace("offset: page * pageSize", "offset: 0").replace("total_count ?? 0", "events.length");
}

const checks = [
  ["query key owns server page", /voidsOnly,\s*page/.test(source)],
  ["request sends bounded page", /limit: pageSize/.test(source) && /offset: page \* pageSize/.test(source)],
  ["exact total drives navigation", /total_count \?\? 0/.test(source)],
  ["one external exact pager mounted", /driver-audit-server-pager/.test(source) && /of \{totalCount\}/.test(source)],
  ["local table pager is suppressed", /pageSize=\{pageSize\}[\s\S]*hidePager/.test(source)],
  ["scope and every server filter reset page", /setPage\(0\).*\[driverId, operatingCompanyId, eventTypeFilter, fromIso, toIso, actorFilter, statusFilter, sourceFilter, voidsOnly\]/s.test(source)],
  ["empty page recovers after lifecycle changes", /page > 0 && events\.length === 0/.test(source)],
  ["cap-disclosure substitute removed", !/CappedListNotice/.test(source)],
  ["API forwards offset", /params\.offset.*search\.set\("offset"/s.test(api)],
  ["backend binds total and stable range", /count\(\*\) OVER\(\)::int AS total_count/.test(service) && /ORDER BY e\.created_at DESC, e\.uuid DESC[\s\S]*LIMIT \$\$\{limitPos\}[\s\S]*OFFSET \$\$\{offsetPos\}/.test(service)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (process.argv.includes("--selftest")) {
  if (failed.length === 2) {
    console.log("PASS: selftest planted offset and exact-total regressions");
    process.exit(0);
  }
  console.error(`FAIL: selftest expected 2 failures, got ${failed.length}`);
  process.exit(1);
}
if (failed.length) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} Driver Audit History range checks`);
