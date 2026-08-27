#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const serviceFile = "apps/backend/src/safety/driver-scheduler.service.ts";
const routesFile = "apps/backend/src/safety/driver-scheduler.routes.ts";
const apiFile = "apps/driver-pwa/src/api/scheduler.ts";
const pageFile = "apps/driver-pwa/src/pages/LeaveRequestList.tsx";

let service = read(serviceFile);
let routes = read(routesFile);
let api = read(apiFile);
let page = read(pageFile);

if (process.argv.includes("--selftest")) {
  service = service.replace("ORDER BY u.unit_number, u.id", "ORDER BY u.unit_number LIMIT 200");
  page = page.replace("totalCount > PAGE_SIZE", "false");
}

const personal = service.slice(service.indexOf("export async function listMyLeaveRequests"), service.indexOf("export async function getMySchedule"));
const fleet = service.slice(service.indexOf("export async function getFleetSchedule"), service.indexOf("export async function listTempAssignments"));

const checks = [
  ["personal history has exact count", /COUNT\(\*\)::int AS total_count/.test(personal)],
  ["personal history pages with parameters", /LIMIT \$3[\s\S]*OFFSET \$4/.test(personal)],
  ["personal history is company and driver scoped", /operating_company_id = \$1::uuid[\s\S]*driver_id = \$2/.test(personal)],
  ["personal history has deterministic order", /ORDER BY created_at DESC, id DESC/.test(personal)],
  ["route validates page query", /driverRequestListQuerySchema\.safeParse\(req\.query/.test(routes)],
  ["route exposes total count", /total_count: rows\.totalCount/.test(routes)],
  ["PWA API sends limit and offset", /URLSearchParams\(\{ limit: String\(limit\), offset: String\(offset\) \}\)/.test(api)],
  ["PWA renders exact range pager", /totalCount > PAGE_SIZE/.test(page) && /common\.previous/.test(page) && /common\.next/.test(page) && /common\.of/.test(page)],
  ["vacant units retain explicit owner-or-lessee scope", /owner_company_id = \$1 OR u\.currently_leased_to_company_id = \$1/.test(fleet)],
  ["vacant units have no silent literal cap", !/LIMIT\s+200/i.test(fleet)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);

if (process.argv.includes("--selftest")) {
  if (failed.length === 2) {
    console.log("PASS: selftest planted both silent-cap regressions");
    process.exit(0);
  }
  console.error(`FAIL: selftest expected 2 failures, got ${failed.length}`);
  process.exit(1);
}

if (failed.length) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} Driver Scheduler cap vertical checks`);
