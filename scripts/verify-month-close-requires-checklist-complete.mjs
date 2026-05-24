#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/month-close.routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/month-close.service.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/MonthClosePage.tsx");

function fail(messages) {
  console.error("verify:month-close-requires-checklist-complete — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

for (const file of [routePath, servicePath, pagePath]) {
  if (!fs.existsSync(file)) failures.push(`missing required file: ${file}`);
}

if (failures.length > 0) fail(failures);

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

if (!routeSource.includes("/api/v1/accounting/month-close-status")) {
  failures.push("month-close status endpoint must be registered");
}
if (!routeSource.includes("/api/v1/accounting/month-close")) {
  failures.push("month-close lock endpoint must be registered");
}
if (!routeSource.includes("checklist_incomplete")) {
  failures.push("route must map checklist_incomplete to 409");
}
if (!serviceSource.includes("checklist_incomplete")) {
  failures.push("service must enforce checklist completeness before lock");
}
if (!/canLock = periodOpen && bankReconComplete && arComplete && apComplete && fuelTaxComplete/.test(serviceSource)) {
  failures.push("service can_lock must be a strict conjunction of all checklist gates");
}
if (!serviceSource.includes("accounting.month_close_locked")) {
  failures.push("month close lock must emit Block-40 audit event");
}
if (!pageSource.includes("Close month")) {
  failures.push("frontend month close page must expose close action");
}
if (!pageSource.includes("disabled={!companyId || !canLock}")) {
  failures.push("frontend close action must be disabled unless can_lock is true");
}

if (failures.length > 0) fail(failures);
console.log("verify:month-close-requires-checklist-complete — OK");
