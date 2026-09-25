#!/usr/bin/env node
// R-177 guard — the AlwaysTrack settlement feeder dates every fuel purchase and every expense by the
// settlement DOCUMENT's own line date (documentLineDate), never the load's delivery date. Measured
// 09-25-2026: 57 of 257 USMCA fuel rows carried the delivery date, moving fuel across month ends.
// Static: fails if feed-settlement-day.mts assigns delivery.stop_date to a fuel date or an expense_date,
// or if documentLineDate stops refusing a missing date.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "scripts/feed/feed-settlement-day.mts");
const src = readFileSync(FILE, "utf8");
const fails = [];
if (/fuelDate\s*=\s*delivery\.stop_date/.test(src)) fails.push("fuelDate is assigned delivery.stop_date");
if (/expense_date:\s*delivery\.stop_date/.test(src)) fails.push("expense_date is assigned delivery.stop_date");
if (!/const fuelDate = documentLineDate\(f, rec\)/.test(src)) fails.push("fuel date does not come from documentLineDate(f, rec)");
if (!/expense_date: documentLineDate\(e, rec\)/.test(src)) fails.push("expense_date does not come from documentLineDate(e, rec)");
if (!/throw new Error\(`document_line_date_missing/.test(src)) fails.push("documentLineDate no longer refuses a missing date");
if (!/throw new Error\(`document_line_date_after_period_end/.test(src)) fails.push("documentLineDate no longer refuses a date after period end");
// selftest: the detector must catch the old line
if (!/fuelDate\s*=\s*delivery\.stop_date/.test("const fuelDate = delivery.stop_date;")) fails.push("selftest: detector broken");
if (fails.length) {
  console.error(`verify-feed-uses-document-line-dates: FAIL — ${fails.join("; ")}`);
  process.exit(1);
}
console.log("verify-feed-uses-document-line-dates: PASS — fuel and expense dates come from the settlement document line (documentLineDate), missing/after-period dates refuse.");
