#!/usr/bin/env node
/**
 * verify-driver-hub-surfaces-pack.mjs — DHUB-S01..S05 + LINK-01 ratchet.
 * Covers every Driver Hub tab surface: overview inbox, scheduler, leave requests, reporting, cascade linkage.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-surfaces-pack";

const FILES = {
  hubPage: "apps/frontend/src/pages/home/DriverHubPage.tsx",
  reporting: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx",
  inbox: "apps/frontend/src/components/driver-inbox/DriverInbox.tsx",
  scheduler: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
  leaveRequests: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertWiring(readSourceFn = readSource) {
  const problems = [];
  const hub = readSourceFn(FILES.hubPage);
  const reporting = readSourceFn(FILES.reporting);
  const inbox = readSourceFn(FILES.inbox);
  const scheduler = readSourceFn(FILES.scheduler);
  const leave = readSourceFn(FILES.leaveRequests);
  const manifest = readSourceFn(FILES.manifest);

  if (!manifest.includes('path="/driver-hub"')) problems.push("manifest missing /driver-hub");
  if (!manifest.includes('path="/driver-hub/reporting"')) problems.push("manifest missing /driver-hub/reporting");

  for (const [name, src, needles] of [
    [FILES.hubPage, hub, ['useSearchParams', "leave_requests", "DriverSchedulerGridPage", "DriverSchedulerRequestInboxPage", "DriverInbox"]],
    [FILES.reporting, reporting, ["ListErrorBanner", "EntityLink", "getInboxReporting", 'data-testid="driver-hub-reporting-need-company"']],
    [FILES.inbox, inbox, ['<EntityLink kind="driver"', "cascadePreview", "Linkage — what posts on approve", "ListErrorBanner", "cashAdvanceRequestsOfficeApi.listPending", 'data-testid="driver-inbox-list-error"', '<SelectCombobox', 'aria-label="Pay from account"']],
    [FILES.scheduler, scheduler, ['<EntityLink kind="driver"', "No drivers are available for this operating company.", "Select an operating company"]],
    [FILES.leaveRequests, leave, ['<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"', "Select an operating company to view leave requests."]],
  ]) {
    for (const needle of needles) {
      if (!src.includes(needle)) problems.push(`${name} missing ${JSON.stringify(needle)}`);
    }
  }

  if (/<select[^>]*>[\s\S]*?Company default cash account/.test(inbox)) {
    problems.push(`${FILES.inbox} pay-from account regressed to a native select`);
  }

  return problems;
}

function run() {
  const problems = assertWiring();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const originals = Object.fromEntries(Object.values(FILES).map((f) => [f, readSource(f)]));
  const cases = [
    [FILES.inbox, 'data-testid="driver-inbox-list-error"', "inbox ListErrorBanner testid"],
    [FILES.inbox, "Linkage — what posts on approve", "cascade linkage panel"],
    [FILES.inbox, '<SelectCombobox', "searchable pay-from account adapter"],
    [FILES.scheduler, "No drivers are available for this operating company.", "scheduler honest empty"],
    [FILES.leaveRequests, '<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"', "leave-request driver reverse link"],
  ];
  for (const [file, needle, label] of cases) {
    const mutated = originals[file].replaceAll(needle, "");
    if (mutated === originals[file]) throw new Error(`${LABEL}: inert selftest mutation for ${file}`);
    const problems = assertWiring((rel) => (rel === file ? mutated : originals[rel]));
    if (!problems.length) throw new Error(`${LABEL}: selftest did not reject missing ${label}`);
  }
  assertWiring((rel) => originals[rel]);
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
