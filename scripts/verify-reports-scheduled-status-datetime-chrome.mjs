#!/usr/bin/env node
/**
 * verify-reports-scheduled-status-datetime-chrome.mjs
 * LV-REPORTS-SCHEDULED-RAW-STATUS-DATETIME-CHROME
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-scheduled-status-datetime-chrome";
const PAGE = "apps/frontend/src/pages/reports/SubscriptionManager.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);
  if (!/formatDateTimeUS/.test(page) || !/from ["'].*lib\/formatDate["']/.test(page)) {
    failures.push("SubscriptionManager must import formatDateTimeUS");
  }
  if (!/subscriptionStatusLabel|Active/.test(page) || /"active"\s*:\s*"inactive"|\? "active" : "inactive"/.test(page)) {
    failures.push("Status must render governed Active/Inactive labels");
  }
  if (/\? "active" : "inactive"/.test(page)) {
    failures.push("raw lowercase active/inactive status labels are forbidden");
  }
  if (/\.slice\(0,\s*19\)/.test(page)) {
    failures.push("must not slice raw ISO timestamps for display (Last sent / Next / Sent at)");
  }
  if (!/subscriptionTimestampLabel\(row\.last_sent_at\)/.test(page)
    || !/subscriptionTimestampLabel\(row\.next_scheduled_at\)/.test(page)) {
    failures.push("Last sent and Next must use subscriptionTimestampLabel");
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
    let bad = original.replace(
      /\{subscriptionStatusLabel\(row\.is_active\)\}/,
      '{row.is_active ? "active" : "inactive"}',
    );
    bad = bad.replace(
      /subscriptionTimestampLabel\(row\.last_sent_at\)/,
      "row.last_sent_at?.slice(0, 19) ?? \"—\"",
    );
    if (bad === original) fail("selftest could not plant raw status/datetime");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /Active\/Inactive|slice raw ISO|subscriptionTimestampLabel/.test(m))) {
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
console.log(`${LABEL} PASS — Scheduled Subscriptions status/datetime use governed chrome`);
