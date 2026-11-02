#!/usr/bin/env node
/** Shell QA — Driver detail/layover + Notification Center + Audit Events use formatDateTimeUS. */
import fs from "node:fs";

const LABEL = "verify-driver-audit-datetime-format";
const FILES = [
  "apps/frontend/src/pages/DriverDetail.tsx",
  "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx",
  "apps/frontend/src/pages/notifications/NotificationCenterPage.tsx",
  "apps/frontend/src/pages/audit/AuditEventsList.tsx",
];

const fails = [];
for (const path of FILES) {
  const src = fs.readFileSync(path, "utf8");
  if (!/formatDateTimeUS/.test(src)) fails.push(`${path}: must use formatDateTimeUS`);
  if (/new Date\([^)]+\)\.toLocaleString\(/.test(src)) fails.push(`${path}: must not new Date(...).toLocaleString()`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL`, fails);
    process.exit(1);
  }
  const plant = fs.readFileSync(FILES[0], "utf8").replace(/formatDateTimeUS/g, "BAD");
  if (/formatDateTimeUS/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — driver/audit/notification datetime format`);
