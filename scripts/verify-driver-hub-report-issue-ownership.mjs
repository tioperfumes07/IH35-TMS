#!/usr/bin/env node
/**
 * verify-driver-hub-report-issue-ownership.mjs
 * LV-DRIVER-HUB-REPORT-ISSUE-MODAL-MISOWNED-LEAF
 *
 * ReportIssueModal is load-scoped driver-app chrome (DriverLoadDetailPage).
 * Office Driver Hub must not claim the leaf; drivers matrix owns it.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-driver-hub-report-issue-ownership";
const HUB_REQ = "docs/specs/scoreboard/modules/driver-hub.required.json";
const DRV_REQ = "docs/specs/scoreboard/modules/drivers.required.json";
const HUB_PAGE = "apps/frontend/src/pages/home/DriverHubPage.tsx";
const LOAD_PAGE = "apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const hub = JSON.parse(read(HUB_REQ));
  const drv = JSON.parse(read(DRV_REQ));
  const hubIds = (hub.leaves ?? []).map((l) => l.id);
  const drvIds = (drv.leaves ?? []).map((l) => l.id);
  if (hubIds.includes("driver-hub.modal.report_issue")) {
    failures.push("driver-hub.required.json must not claim driver-hub.modal.report_issue");
  }
  if (!drvIds.includes("drivers.modal.report_issue")) {
    failures.push("drivers.required.json must own drivers.modal.report_issue");
  } else {
    const leaf = (drv.leaves ?? []).find((l) => l.id === "drivers.modal.report_issue");
    if (leaf?.surface_path !== "pages/driver/ReportIssueModal.tsx") {
      failures.push("drivers.modal.report_issue surface_path must be pages/driver/ReportIssueModal.tsx");
    }
  }
  const hubPage = read(HUB_PAGE);
  if (/ReportIssueModal/.test(hubPage)) {
    failures.push("DriverHubPage must not mount ReportIssueModal (driver-app only)");
  }
  const loadPage = read(LOAD_PAGE);
  if (!/ReportIssueModal/.test(loadPage) || !/reportOpen/.test(loadPage)) {
    failures.push("DriverLoadDetailPage must mount ReportIssueModal with reportOpen");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  // Structural: analyze() on real tree should pass after fix; plant hub claim.
  const hubPath = path.join(process.cwd(), HUB_REQ);
  const original = fs.readFileSync(hubPath, "utf8");
  try {
    const j = JSON.parse(original);
    j.leaves = [
      ...(j.leaves ?? []),
      {
        id: "driver-hub.modal.report_issue",
        surface_path: "pages/driver/ReportIssueModal.tsx",
        required: ["connectivity"],
      },
    ];
    fs.writeFileSync(hubPath, JSON.stringify(j, null, 2) + "\n");
    const bad = analyze();
    if (!bad.some((m) => /must not claim/.test(m))) {
      fail("selftest expected hub claim to fail");
    }
  } finally {
    fs.writeFileSync(hubPath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — report_issue owned by drivers / DriverLoadDetailPage`);
