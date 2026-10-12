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

// Selftest plants go through this in-memory overlay - no tracked file is ever written.
const SELFTEST_OVERLAY = new Map();

function read(rel) {
  if (SELFTEST_OVERLAY.has(rel)) return SELFTEST_OVERLAY.get(rel);
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

// LEAD 443.99 class B (2026-10-12) — display-date formatter.
//   old rule: SubscriptionManager imports formatDateTimeUS (import presence only).
//   new rule: SubscriptionManager imports mmmDdTime from lib/formatDate AND subscriptionTimestampLabel returns mmmDdTime(value) (stricter: the helper must actually use it).
//   why: GLB-08 (#25795, 2026-10-07, owner-approved app-wide MMM-DD date sweep) converted report date displays from
//        legacy MM/DD/YYYY formatDateUS / formatDateTimeUS to lib/formatDate mmmDd / mmmDdTime. The page was right;
//        the guard still demanded the retired formatter. A raw ISO / sliced timestamp still fails.
function analyze() {
  const failures = [];
  const page = read(PAGE);
  if (!/import \{[^}]*\bmmmDdTime\b[^}]*\} from ["'].*lib\/formatDate["']/.test(page)) {
    failures.push("SubscriptionManager must import mmmDdTime");
  }
  if (!/function subscriptionTimestampLabel\([^)]*\)[^{]*\{[\s\S]{0,120}?return mmmDdTime\(value\)/.test(page)) {
    failures.push("subscriptionTimestampLabel must format through mmmDdTime");
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
    const rawHelper = original.replace(/return mmmDdTime\(value\) \|\| "—";/, 'return value.slice(0, 16) || "—";');
    SELFTEST_OVERLAY.set(PAGE, rawHelper);
    if (rawHelper === original || !analyze().some((m) => /through mmmDdTime|slice raw ISO/.test(m))) {
      fail("selftest expected raw-ISO subscriptionTimestampLabel to fail");
    }
    SELFTEST_OVERLAY.set(PAGE, bad);
    const planted = analyze();
    if (!planted.some((m) => /Active\/Inactive|slice raw ISO|subscriptionTimestampLabel/.test(m))) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
  } finally {
    SELFTEST_OVERLAY.delete(PAGE);
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
