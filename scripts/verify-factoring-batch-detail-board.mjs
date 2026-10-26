#!/usr/bin/env node
/** Fill-not-shell — BatchDetail summary/invoices/reserve use BoardSection. */
import fs from "node:fs";
const FILE = "apps/frontend/src/pages/factoring/BatchDetail.tsx";
const selftest = process.argv.includes("--selftest");
function analyze(src) {
  const e = [];
  for (const id of [
    "factoring-batch-detail-summary",
    "factoring-batch-detail-invoices",
    "factoring-batch-detail-reserve-movements",
    "factoring-batch-detail-loading",
  ]) {
    if (!src.includes(`testId="${id}"`) || !src.includes("<BoardSection")) {
      e.push(`${FILE}: missing BoardSection testId=${id}`);
    }
  }
  if (/rounded-sm border border-gray-200 p-3/.test(src)) {
    e.push(`${FILE}: layered bare card still present`);
  }
  if (!src.includes('data-testid="factoring-batch-detail-expected-reserve"')) {
    e.push(`${FILE}: expected reserve KPI must remain`);
  }
  return e;
}
const live = fs.readFileSync(FILE, "utf8");
if (selftest) {
  const clean = analyze(live);
  if (clean.length) { console.error("SELFTEST FAIL live:\n- " + clean.join("\n- ")); process.exit(1); }
  if (!analyze(live.replace(/<BoardSection/g, "<div")).length) { console.error("SELFTEST FAIL plant"); process.exit(1); }
  console.log("PASS verify-factoring-batch-detail-board --selftest");
  process.exit(0);
}
const fails = analyze(live);
if (fails.length) { console.error("FAIL"); fails.forEach((f) => console.error("- " + f)); process.exit(1); }
console.log("PASS verify-factoring-batch-detail-board");
