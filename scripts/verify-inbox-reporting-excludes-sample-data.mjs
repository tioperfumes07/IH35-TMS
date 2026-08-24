#!/usr/bin/env node
/** @matrix-built {"modules":["driver-hub"],"cols":["connectivity"],"leaves":["driver_hub.reporting.exclude_sample"],"task":"CASH-ADVANCE-REPORTING-F4583-SAMPLE-DATA-IN-KPIS","vertical":"class-sweep"} */
/**
 * CASH-ADVANCE-REPORTING-F4583-SAMPLE-DATA-IN-KPIS: getInboxReportingData (the query backing
 * /driver-hub/reporting's "Request accountability (read-only)" KPI tiles and by_driver/by_load
 * breakdowns) joins mdata.drivers but must exclude is_sample_data rows, same as the sibling fix
 * already shipped for the driver list/picker read (LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-
 * PICKER-2026-08-23) and for mdata.units (DISPATCH-4). Live-measured on prod 2026-08-23: the only
 * cash_advance_requests row system-wide for USMCA belonged to a driver flagged is_sample_data=true,
 * so every KPI tile was 100% fixture data presented as real accountability metrics with zero
 * disclosure.
 *
 * Self-test: node scripts/verify-inbox-reporting-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/driver-finance/inbox-reporting.service.ts",
};
const LABEL = "verify-inbox-reporting-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const queryMatch = src.service.match(
    /JOIN mdata\.drivers d ON d\.id = car\.driver_id AND d\.operating_company_id = car\.operating_company_id[\s\S]*?WHERE car\.operating_company_id/,
  );
  if (!queryMatch) {
    failures.push(`${FILES.service}: getInboxReportingData's mdata.drivers JOIN not found (re-anchor)`);
    return failures;
  }
  const body = queryMatch[0];
  if (!/d\.is_sample_data IS NOT TRUE/.test(body)) {
    failures.push(
      `${FILES.service}: getInboxReportingData must exclude is_sample_data rows from its ` +
        `mdata.drivers JOIN, matching drivers.routes.ts (LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-` +
        `PROD-PICKER) and units.routes.ts (DISPATCH-4) — otherwise /driver-hub/reporting's KPI tiles ` +
        `(Total Requests/Approved/Approval Rate/Approved Volume) can be 100% fixture data presented ` +
        `as real accountability metrics`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    ...good,
    service: good.service.replace("\n        AND d.is_sample_data IS NOT TRUE", ""),
  };
  if (mutated.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — /driver-hub/reporting excludes is_sample_data fixture rows from its KPIs`);
