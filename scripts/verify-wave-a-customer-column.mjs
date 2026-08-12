#!/usr/bin/env node
/** @matrix-built {"modules":["home","dispatch","driver-hub","reports","factoring","accounting","customers","banking","cash-flow"],"cols":["customer"],"leafRe":".*","task":"WAVE-A-customer","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts", /l\.customer_id::text/],
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/backend/src/driver/loads.routes.ts", /customer_id:\s*row\.customer_id/],
  ["apps/frontend/src/pages/driver/DriverLoadsPage.tsx", /<EntityLink kind="customer" id=\{load\.customer_id\}/],
  ["apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx", /<EntityLink kind="customer" id=\{load\.customer_id\}/],
  ["apps/backend/src/reports/dispatch-margin.routes.ts", /l\.customer_id::text/],
  ["apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /<EntityLink kind="customer" id=\{row\.customer_id\}/],
  ["apps/backend/src/factoring/submission-queue.service.ts", /i\.customer_id::text/],
  ["apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx", /<EntityLink kind="customer" id=\{item\.customer_id\}/],
];
const failures = checks.filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8"))).map(([file]) => `${file}: customer FK/link missing`);
if (failures.length) {
  console.error(`verify-wave-a-customer-column FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-customer-column PASS — customer FK reaches Home, Driver Hub, Reports, and Factoring links");
