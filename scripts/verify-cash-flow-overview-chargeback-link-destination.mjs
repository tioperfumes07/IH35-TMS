#!/usr/bin/env node
// CASHFLOW-OVERVIEW-CHARGEBACK-DISPUTE-LINK-WRONG-DESTINATION — guard
//
// Cash Flow Overview's "Alerts & follow-ups" section showed "Open chargebacks: $X" next to a link that
// navigated to /accounting/dispute-queue (a P6 settlement-dispute surface, driver_finance data) even
// though the $X figure is chargebacks_open_cents = factoring's chargeback_balance
// (views.factoring_summary) -- an entirely different, unrelated dataset that always read 0 disputes on the
// linked page regardless of the real chargeback figure. The real, already-mounted destination for
// factoring chargebacks is /factoring/chargebacks-fees. This guard fails if the alert link regresses back
// to the settlement-dispute route.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx";

export function check(text) {
  const failures = [];
  if (/Open chargebacks:[\s\S]{0,300}?to="\/accounting\/dispute-queue"/.test(text)) {
    failures.push(`${FILE} "Open chargebacks" alert links to /accounting/dispute-queue again — that surface has no connection to the factoring chargeback_balance figure shown`);
  }
  if (!/Open chargebacks:[\s\S]{0,300}?to="\/factoring\/chargebacks-fees"/.test(text)) {
    failures.push(`${FILE} "Open chargebacks" alert no longer links to the real /factoring/chargebacks-fees destination`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: cash-flow-overview-chargeback-link-destination");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Cash Flow Overview 'Open chargebacks' alert links to the real factoring chargebacks page, not the unrelated settlement dispute queue");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace('to="/factoring/chargebacks-fees"', 'to="/accounting/dispute-queue"');
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to /accounting/dispute-queue) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
