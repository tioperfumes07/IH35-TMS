#!/usr/bin/env node
/**
 * GUARD 2184 — Cargo claim intake EntityLinks must not use UUID-slice fallback labels.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-cargo-claim-entitylink-labels";
const FE = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const BE = "apps/backend/src/safety/incidents.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  const backend = sources?.[BE] ?? read(BE);
  if (!/EntityLink/.test(src) || !/kind=["']customer["']/.test(src) || !/kind=["']load["']/.test(src) || !/kind=["']driver["']/.test(src)) {
    problems.push(`${FE}: missing customer/load/driver EntityLinks`);
  }
  if (/claimant_customer_id\)\.slice\(0,\s*8\)/.test(src) || /load_id\)\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FE}: UUID-slice EntityLink fallback is forbidden`);
  }
  if (!/row\.claimant_customer_name\s*\?\?/.test(src) || !/row\.load_number\s*\?\?/.test(src)) {
    problems.push(`${FE}: list labels must prefer names returned by the incident reader before picker-map fallback`);
  }
  const customerNameSelects = backend.match(/c\.customer_name AS claimant_customer_name/g) ?? [];
  const companyScopedCustomerJoins = backend.match(/LEFT JOIN mdata\.customers c[\s\S]{0,180}?c\.id = i\.claimant_customer_id[\s\S]{0,180}?c\.operating_company_id = i\.operating_company_id/g) ?? [];
  if (customerNameSelects.length < 2 || companyScopedCustomerJoins.length < 2) {
    problems.push(`${BE}: list and detail readers must resolve claimant customer labels with same-company joins`);
  }
  if (!/key:\s*["']driver_id["'][\s\S]{0,500}?kind=["']driver["']/.test(src)) {
    problems.push(`${FE}: cargo claim list must render the persisted driver FK as an EntityLink`);
  }
  if (!/Driver:\{" "\}[\s\S]{0,500}?detail\?\.driver_id[\s\S]{0,500}?kind=["']driver["']/.test(src)) {
    problems.push(`${FE}: cargo claim detail must render the persisted driver FK as an EntityLink`);
  }
  if (!/onClick=\{\(\) => navigate\(`\/customers\/\$\{String\(row\.claimant_customer_id\)\}`\)\}/.test(src)
      || !/onClick=\{\(\) => navigate\(`\/customers\/\$\{String\(detail\.claimant_customer_id\)\}`\)\}/.test(src)) {
    problems.push(`${FE}: customer EntityLinks must explicitly navigate from list and detail surfaces`);
  }
  if (!/onClick=\{\(\) => navigate\(`\/drivers\/\$\{String\(row\.driver_id\)\}`\)\}/.test(src)
      || !/onClick=\{\(\) => navigate\(`\/drivers\/\$\{String\(detail\.driver_id\)\}`\)\}/.test(src)) {
    problems.push(`${FE}: driver EntityLinks must explicitly navigate from list and detail surfaces`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE), [BE]: read(BE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    [FE]: live[FE] + "\nlabel={String(row.load_id).slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  const noDriver = assert({ [FE]: live[FE].replaceAll('kind="driver"', 'kind="user"') });
  if (!noDriver.some((p) => p.includes("customer/load/driver") || p.includes("driver FK"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted missing driver links not caught`, noDriver);
    process.exit(1);
  }
  const deadCustomer = assert({
    ...live,
    [FE]: live[FE].replaceAll("onClick={() => navigate(`/customers/${String(row.claimant_customer_id)}`)}", ""),
  });
  if (!deadCustomer.some((p) => p.includes("explicitly navigate"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted dead customer link not caught`, deadCustomer);
    process.exit(1);
  }
  const missingReaderLabel = assert({
    ...live,
    [BE]: live[BE].replaceAll("c.customer_name AS claimant_customer_name", "NULL::text AS claimant_customer_name"),
  });
  if (!missingReaderLabel.some((p) => p.includes("same-company joins"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted missing customer label reader not caught`, missingReaderLabel);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cargo claim EntityLinks forbid UUID-slice labels`);
