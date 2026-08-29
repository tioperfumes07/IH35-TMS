#!/usr/bin/env node
/**
 * verify-driver-hub-tabs-url-sync.mjs — Ops F: Driver Hub tabs use ?tab=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/home/DriverHubPage.tsx";
const INBOX = "apps/frontend/src/components/driver-inbox/DriverInbox.tsx";
const SCHEDULER = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx";
const LEAVE_REQUESTS = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx";

function assertWiring(readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8")) {
  const source = readSource(PAGE);
  for (const needle of [
    "useSearchParams",
    "useLocation",
    "parseDriverHubTab",
    'params.set("tab", next)',
    'navigate({ pathname: "/driver-hub"',
    'key="scheduler"',
    'key="leave_requests"',
  ]) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<HubTab>("overview")')) {
    throw new Error(`${LABEL}: local tab useState still present in ${PAGE}`);
  }

  const inbox = readSource(INBOX);
  const scheduler = readSource(SCHEDULER);
  const leaveRequests = readSource(LEAVE_REQUESTS);
  for (const [relativePath, child] of [[INBOX, inbox], [SCHEDULER, scheduler], [LEAVE_REQUESTS, leaveRequests]]) {
    if (!child.includes("operating_company_id") && !child.includes("operatingCompanyId") && !child.includes("companyId")) {
      throw new Error(`${LABEL}: ${relativePath} must retain explicit company scope`);
    }
  }
  if (!inbox.includes('<EntityLink kind="driver"')) throw new Error(`${LABEL}: ${INBOX} must link requests to driver detail`);
  if (!scheduler.includes('<EntityLink kind="driver"')) throw new Error(`${LABEL}: ${SCHEDULER} must link rows to driver detail`);
  if (!leaveRequests.includes('<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"')) {
    throw new Error(`${LABEL}: ${LEAVE_REQUESTS} must link rows to driver detail with an honest tombstone fallback`);
  }
  if (!scheduler.includes("No drivers are available for this operating company.")) throw new Error(`${LABEL}: ${SCHEDULER} must keep an honest empty state`);
  if (!scheduler.includes("Select an operating company") || !leaveRequests.includes("Select an operating company")) {
    throw new Error(`${LABEL}: scheduler surfaces must explain missing company context`);
  }
}

function run() {
  assertWiring();
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const originals = new Map([PAGE, INBOX, SCHEDULER, LEAVE_REQUESTS].map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
  const cases = [
    [SCHEDULER, '<EntityLink kind="driver"', "driver link"],
    [LEAVE_REQUESTS, '<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"', "leave-request driver link"],
    [SCHEDULER, "No drivers are available for this operating company.", "honest empty state"],
    [LEAVE_REQUESTS, "Select an operating company", "company-context state"],
  ];
  for (const [file, needle, label] of cases) {
    const mutated = originals.get(file).replaceAll(needle, "");
    if (mutated === originals.get(file)) throw new Error(`${LABEL}: inert selftest mutation for ${file}`);
    let failed = false;
    try {
      assertWiring((relativePath) => relativePath === file ? mutated : originals.get(relativePath));
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`${LABEL}: selftest did not reject missing ${label}`);
  }
  assertWiring((relativePath) => originals.get(relativePath));
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
