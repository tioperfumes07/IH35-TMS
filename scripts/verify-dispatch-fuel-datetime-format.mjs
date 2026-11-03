#!/usr/bin/env node
/**
 * Shell QA — POD Captured, Late Arrivals ETA, Fuel Fraud Detected must use formatDateTimeUS
 * (Central MM/DD/YYYY · h:mm a), never browser toLocaleString.
 */
import fs from "node:fs";

const LABEL = "verify-dispatch-fuel-datetime-format";
const POD = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";
const LATE = "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx";
const FRAUD = "apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx";

const pod = fs.readFileSync(POD, "utf8");
const late = fs.readFileSync(LATE, "utf8");
const fraud = fs.readFileSync(FRAUD, "utf8");
const fails = [];

if (!/formatDateTimeUS\(doc\.created_at\)/.test(pod)) {
  fails.push(`${POD}: Captured column must use formatDateTimeUS(doc.created_at)`);
}
if (/new Date\(doc\.created_at\)\.toLocaleString\(\)/.test(pod)) {
  fails.push(`${POD}: must not toLocaleString created_at`);
}
if (!/formatDateTimeUS\(String\(prediction\.predicted_arrival_at\)\)/.test(late)) {
  fails.push(`${LATE}: etaLabel must format predicted_arrival_at via formatDateTimeUS`);
}
if (!/formatDateTimeUS\(load\.next_stop_scheduled_at\)/.test(late)) {
  fails.push(`${LATE}: Scheduled column must use formatDateTimeUS`);
}
if (/toLocaleString\(\)/.test(late)) {
  fails.push(`${LATE}: must not call toLocaleString`);
}
if (!/formatDateTimeUS\(row\.detected_at\)/.test(fraud)) {
  fails.push(`${FRAUD}: Detected column must use formatDateTimeUS`);
}
if (/new Date\(row\.detected_at\)\.toLocaleString\(\)/.test(fraud)) {
  fails.push(`${FRAUD}: must not toLocaleString detected_at`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = pod.replace(/formatDateTimeUS\(doc\.created_at\)/g, "new Date(doc.created_at).toLocaleString()");
  if (!/toLocaleString/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — POD/Late/Fraud use formatDateTimeUS`);
