#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const SERVICE = "apps/backend/src/mdata/equipment-aggregate.service.ts";

export function problems(page, service) {
  const failures = [];
  for (const id of [
    "tp-section-1-identity",
    "tp-section-2-specs",
    "tp-section-3-assignment",
    "tp-section-5-maintenance",
    "tp-section-6-compliance",
    "tp-section-7-documents",
    "tp-section-8-action-bar",
  ]) {
    if (!page.includes(id)) failures.push(`missing ${id}`);
  }

  // P31: a trailer's reverse history must use the persisted assignment FK, include inactive
  // historical loads, and render a canonical link back to the load drawer.
  if (!/FROM dispatch\.load_assignment_history lah[\s\S]{0,500}?lah\.new_trailer_id = \$1::uuid/.test(service)) {
    failures.push("P31 reverse read must use load_assignment_history.new_trailer_id");
  }
  if (!/lah\.operating_company_id = \$2::uuid/.test(service)) {
    failures.push("P31 reverse read must be operating-company scoped");
  }
  if (!/data-testid="tp-section-3b-load-history"/.test(page) || !/<EntityLink[\s\S]{0,160}?kind="load"/.test(page)) {
    failures.push("P31 trailer profile must render linked load history with EntityLink");
  }
  return failures;
}

function selftest() {
  const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const cases = [
    ["baseline", page, service, 0],
    ["history FK removed", page, service.replace("lah.new_trailer_id = $1::uuid", "lah.new_unit_id = $1::uuid"), 1],
    ["opco scope removed", page, service.replace("lah.operating_company_id = $2::uuid", "TRUE"), 1],
    ["load link removed", page.replace('kind="load"', 'kind="trailer"'), service, 1],
  ];
  for (const [name, p, s, minimum] of cases) {
    const count = problems(p, s).length;
    if (count < minimum || (minimum === 0 && count !== 0)) {
      console.error(`verify:trailer-profile-sections-complete SELFTEST FAIL: ${name} produced ${count}`);
      process.exit(1);
    }
  }
  console.log("verify:trailer-profile-sections-complete SELFTEST PASS — 3/3 P31 mutations caught");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = problems(
  fs.readFileSync(path.join(ROOT, PAGE), "utf8"),
  fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
);
if (failures.length) {
  for (const failure of failures) console.error(`verify:trailer-profile-sections-complete FAIL: ${failure}`);
  process.exit(1);
}
console.log("verify:trailer-profile-sections-complete PASS — P31 trailer↔historical-load reverse link ratcheted");
