#!/usr/bin/env node
/** U29 — Company/Driver settlements picker must EntityLink settlement, driver, unit, company settlement. */
import fs from "node:fs";

const LABEL = "verify-company-driver-picker-u29";
const FILE = "apps/frontend/src/pages/driver-finance/SettlementsCompanyDriverTab.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];

if (!/kind="settlement"[\s\S]{0,60}r\.settlement_id/.test(src) && !/kind="settlement" id=\{r\.settlement_id\}/.test(src)) {
  fails.push(`${FILE}: Settlement/Tour must EntityLink via settlement_id`);
}
if (!/kind="driver" id=\{r\.driver_id\}/.test(src)) {
  fails.push(`${FILE}: Driver column must EntityLink via driver_id`);
}
if (!/kind="unit" id=\{r\.unit_id\}/.test(src)) {
  fails.push(`${FILE}: Unit column must EntityLink via unit_id`);
}
if (!/kind="company_settlement" id=\{r\.company_settlement_id\}/.test(src)) {
  fails.push(`${FILE}: Company settlement must EntityLink when company_settlement_id present`);
}
if (/render: \(r\) => <span className="block max-w-\[200px\] truncate" title=\{r\.driver_name/.test(src)) {
  fails.push(`${FILE}: must not only paint plain driver_name`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = src
    .replace(/kind="settlement"/g, 'kind="load"')
    .replace(/kind="driver"/g, 'kind="load"')
    .replace(/kind="unit"/g, 'kind="load"')
    .replace(/kind="company_settlement"/g, 'kind="load"');
  if (/kind="driver" id=\{r\.driver_id\}/.test(plant)) {
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
console.log(`${LABEL}: PASS — Company/Driver picker EntityLinks settlement/driver/unit/CS`);
