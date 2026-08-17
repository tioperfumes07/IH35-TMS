#!/usr/bin/env node
/**
 * verify-reports-scheduled-custom-raw-chrome-delete.mjs
 * LV-REPORTS-SCHEDULED-CUSTOM-RAW-CHROME-DELETE
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-scheduled-custom-raw-chrome-delete";
const PAGE = "apps/frontend/src/pages/reports/ScheduledReportsPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);

  if (!/formatDateTimeUS/.test(page) || !/from ["'].*lib\/formatDate["']/.test(page)) {
    failures.push("ScheduledReportsPage must import formatDateTimeUS");
  }
  if (!/scheduledTimestampLabel\(r\.last_run_at\)/.test(page) || !/scheduledTimestampLabel\(r\.next_run_at\)/.test(page)) {
    failures.push("Last run and Next run must use scheduledTimestampLabel");
  }
  if (/\.slice\(0,\s*19\)/.test(page)) {
    failures.push("must not slice raw ISO timestamps for Last/Next display");
  }
  if (!/scheduledStatusLabel/.test(page) || !/"Active"/.test(page) || !/"Paused"/.test(page)) {
    failures.push("Status must use scheduledStatusLabel with Active/Paused");
  }
  if (/\{r\.status\}/.test(page)) {
    failures.push("raw {r.status} in JSX is forbidden");
  }
  if (!/REPORT_LABELS/.test(page) || !/scheduledReportLabel/.test(page)) {
    failures.push("Report column must use governed REPORT_LABELS via scheduledReportLabel");
  }
  if (/>\s*Delete\s*</.test(page) || /pushToast\("Deleted"/.test(page) || /pushToast\("Delete failed"/.test(page)) {
    failures.push("Delete chrome/copy is forbidden — use Deactivate + soft-void toasts");
  }
  if (!/>\s*Deactivate\s*</.test(page) || !/pushToast\("Deactivated"/.test(page)) {
    failures.push("Deactivate button + Deactivated toast required (backend soft-void preserved)");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    let bad = original
      .replace(/\{scheduledStatusLabel\(r\.status\)\}/, "{r.status}")
      .replace(/scheduledTimestampLabel\(r\.last_run_at\)/, 'r.last_run_at?.slice(0, 19) ?? "—"')
      .replace(/>\s*Deactivate\s*</, ">Delete<")
      .replace(/pushToast\("Deactivated"/, 'pushToast("Deleted"');
    if (bad === original) fail("selftest could not plant raw chrome/Delete");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (
      !planted.some((m) =>
        /raw \{r\.status\}|slice raw ISO|Delete chrome|scheduledTimestampLabel|Active\/Paused/.test(m),
      )
    ) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Scheduled Custom report/status/datetime/Deactivate chrome governed`);
