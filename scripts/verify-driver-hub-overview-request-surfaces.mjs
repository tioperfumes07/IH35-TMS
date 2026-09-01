#!/usr/bin/env node
/**
 * verify-driver-hub-overview-request-surfaces.mjs
 * Driver Hub Overview must mount request/alert surfaces — not empty chrome.
 * Ratchets: alert cards (leave, cash advance, road service, messages, doc alerts),
 * canonical DriverInbox, and embedded leave-request inbox preview.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-overview-request-surfaces";

const FILES = {
  hubPage: "apps/frontend/src/pages/home/DriverHubPage.tsx",
  overview: "apps/frontend/src/pages/home/DriverHubOverview.tsx",
  inbox: "apps/frontend/src/components/driver-inbox/DriverInbox.tsx",
  leaveInbox: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
};

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertWiring(readSourceFn = readSource) {
  const problems = [];
  const hub = readSourceFn(FILES.hubPage);
  const overview = readSourceFn(FILES.overview);
  const inbox = readSourceFn(FILES.inbox);
  const leave = readSourceFn(FILES.leaveInbox);

  if (!hub.includes("DriverHubOverview")) problems.push(`${FILES.hubPage} must mount DriverHubOverview on overview tab`);
  if (!/\{tab === "overview" && <DriverHubOverview\s+(?=[^>]*companyId=\{companyId\})(?=[^>]*canReview=\{canReview\})[^>]*\/>\}/.test(hub)) {
    problems.push(`${FILES.hubPage} overview branch must pass companyId + canReview to DriverHubOverview`);
  }

  for (const [name, src, needles] of [
    [
      FILES.overview,
      overview,
      [
        'data-testid="driver-hub-overview"',
        'data-testid="driver-hub-request-alerts"',
        'data-testid="driver-hub-inbox-section"',
        'data-testid="driver-hub-leave-preview"',
        "driverSchedulerOfficeApi.listPending",
        "cashAdvanceRequestsOfficeApi.listPending",
        "/api/v1/road-service-tickets",
        "getDriverMessagesInbox",
        "getDocumentAlertsInbox",
        "<DriverInbox companyId={companyId} canReview={canReview} />",
        "<DriverSchedulerRequestInboxPage embedded />",
        'to: "/driver-finance/cash-advance-requests"',
        'to: "/maintenance/road-service"',
        'to: "/drivers/messages"',
        'to: "/drivers/alerts"',
      ],
    ],
    [FILES.inbox, inbox, ['cashAdvanceRequestsOfficeApi.listPending', "Approve &amp; post"]],
    [FILES.leaveInbox, leave, ["driverSchedulerOfficeApi.listPending", "No pending leave requests."]],
  ]) {
    for (const needle of needles) {
      if (!src.includes(needle)) problems.push(`${name} missing ${JSON.stringify(needle)}`);
    }
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
    [FILES.overview, 'data-testid="driver-hub-request-alerts"', "alert cards section"],
    [FILES.overview, "<DriverInbox companyId={companyId} canReview={canReview} />", "canonical inbox mount"],
    [FILES.overview, "cashAdvanceRequestsOfficeApi.listPending", "cash advance alert query"],
    [FILES.overview, "getDriverMessagesInbox", "messages inbox query"],
    [FILES.hubPage, "DriverHubOverview", "overview component on hub page"],
  ];
  for (const [file, needle, label] of cases) {
    const mutated = originals[file].replaceAll(needle, "");
    if (mutated === originals[file]) throw new Error(`${LABEL}: inert selftest mutation for ${file}`);
    const problems = assertWiring((rel) => (rel === file ? mutated : originals[rel]));
    if (!problems.length) throw new Error(`${LABEL}: selftest did not reject missing ${label}`);
  }
  console.log(`${LABEL}: selftest PASS (${cases.length} mutations)`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
