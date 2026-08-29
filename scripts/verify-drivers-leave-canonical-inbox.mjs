#!/usr/bin/env node
/** Ratchets drivers:leave connectivity to the canonical company-scoped office inbox. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-leave-canonical-inbox";
const DRIVERS = "apps/frontend/src/pages/Drivers.tsx";
const INBOX = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function check(drivers, inbox) {
  const errors = [];
  const requirements = [
    [drivers.includes('import { DriverSchedulerRequestInboxPage } from "./safety/driver-scheduler/DriverSchedulerRequestInboxPage"'), "Drivers must import the canonical leave-request inbox"],
    [/subnavTab === "leave"[\s\S]*?<DriverSchedulerRequestInboxPage embedded \/>/.test(drivers), "drivers leave leaf must mount the canonical inbox in embedded mode"],
    [drivers.includes("@matrix-built drivers:leave:{connectivity}"), "drivers:leave connectivity claim must remain leaf-specific"],
    [/export function DriverSchedulerRequestInboxPage\(\{ embedded = false \}/.test(inbox), "canonical inbox must expose explicit embedded mode"],
    [/!embedded \? <PageHeader/.test(inbox), "embedded inbox must suppress its duplicate PageHeader"],
    [/!embedded \? \([\s\S]*?Back to Driver Scheduler grid[\s\S]*?\) : null/.test(inbox), "embedded inbox must suppress its duplicate back link"],
    [/driverSchedulerOfficeApi\.listPending\(operatingCompanyId, PAGE_SIZE, page \* PAGE_SIZE\)/.test(inbox), "inbox read must remain company-scoped and paginated"],
    [/EntityLinkOrTombstone kind="driver"/.test(inbox), "inbox must retain the human driver drill-through"],
    [/EntityLink[\s\S]*?kind="scheduler_request"/.test(inbox), "inbox must retain the request review drill-through"],
    [/<ListErrorState[\s\S]*?query\.refetch/.test(inbox), "inbox must retain actionable error/retry behavior"],
  ];
  for (const [ok, message] of requirements) if (!ok) errors.push(message);
  return errors;
}

function selftest() {
  const drivers = read(DRIVERS);
  const inbox = read(INBOX);
  const mutations = [
    [drivers.replace("<DriverSchedulerRequestInboxPage embedded />", ""), inbox, "mount"],
    [drivers.replace("@matrix-built drivers:leave:{connectivity}", ""), inbox, "leaf claim"],
    [drivers, inbox.replace("listPending(operatingCompanyId, PAGE_SIZE", "listPending(\"\", PAGE_SIZE"), "company scope"],
    [drivers, inbox.replace('kind="driver"', 'kind="customer"'), "driver link"],
    [drivers, inbox.replace('kind="scheduler_request"', 'kind="driver"'), "review link"],
    [drivers, inbox.replace("!embedded ? <PageHeader", "true ? <PageHeader"), "embedded header"],
    [drivers, inbox.replace("<ListErrorState", "<div"), "error state"],
  ];
  if (check(drivers, inbox).length) throw new Error("good fixture rejected");
  for (const [mutatedDrivers, mutatedInbox, name] of mutations) {
    if (check(mutatedDrivers, mutatedInbox).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check(read(DRIVERS), read(INBOX));
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
console.log(`${LABEL}: PASS — drivers:leave mounts the canonical company-scoped inbox`);
