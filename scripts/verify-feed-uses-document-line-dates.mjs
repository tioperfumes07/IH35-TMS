#!/usr/bin/env node
// R-177 guard — the AlwaysTrack settlement feeder dates every fuel purchase and every expense by the
// settlement DOCUMENT's own line date (documentLineDate), never the load's delivery date. Measured
// 09-25-2026: 57 of 257 USMCA fuel rows carried the delivery date, moving fuel across month ends.
// Static: fails if feed-settlement-day.mts assigns delivery.stop_date to a fuel date or an expense_date,
// or if documentLineDate stops refusing a missing date.
// --selftest plants each failure on the real source (443.95+: verify-guard-selftests-are-real).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "scripts/feed/feed-settlement-day.mts");
const LABEL = "verify-feed-uses-document-line-dates";

export function checkFeedSource(src) {
  const fails = [];
  if (/fuelDate\s*=\s*delivery\.stop_date/.test(src)) fails.push("fuelDate is assigned delivery.stop_date");
  if (/expense_date:\s*delivery\.stop_date/.test(src)) fails.push("expense_date is assigned delivery.stop_date");
  if (!/const fuelDate = documentLineDate\(f, rec\)/.test(src)) fails.push("fuel date does not come from documentLineDate(f, rec)");
  if (!/expense_date: documentLineDate\(e, rec\)/.test(src)) fails.push("expense_date does not come from documentLineDate(e, rec)");
  if (!/throw new Error\(`document_line_date_missing/.test(src)) fails.push("documentLineDate no longer refuses a missing date");
  if (!/throw new Error\(`document_line_date_after_period_end/.test(src)) fails.push("documentLineDate no longer refuses a date after period end");
  return fails;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(FILE, "utf8");
  if (process.argv.includes("--selftest")) {
    const plant = (from, to) => src.split(from).join(to);
    const cases = [
      ["the real feeder passes", checkFeedSource(src).length === 0],
      ["fuel dated by the delivery stop fails", checkFeedSource(plant("const fuelDate = documentLineDate(f, rec)", "const fuelDate = delivery.stop_date")).length > 0],
      ["expense dated by the delivery stop fails", checkFeedSource(plant("expense_date: documentLineDate(e, rec)", "expense_date: delivery.stop_date")).length > 0],
      ["a missing-date refusal removed fails", checkFeedSource(plant("throw new Error(`document_line_date_missing", "void (`document_line_date_missing")).length > 0],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const fails = checkFeedSource(src);
  if (fails.length) {
    console.error(`${LABEL}: FAIL — ${fails.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — fuel and expense dates come from the settlement document line (documentLineDate), missing/after-period dates refuse.`);
}
