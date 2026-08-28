#!/usr/bin/env node
// FLT-F6939 — Fleet + Maintenance shared roster must exhaust the exact unified population.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/FleetTablePage.tsx";
const API = "apps/frontend/src/api/mdata.ts";

export function check(page, api) {
  const failures = [];
  if (/buildUnitsUrl|limit=500/.test(page)) failures.push("FleetTablePage still requests one capped page");
  const scans = page.match(/listAllUnits\s*\(\s*\{/g) ?? [];
  if (scans.length !== 2) failures.push("both full and filtered fleet queries must use listAllUnits");
  if ((page.match(/include:\s*["']trailers["']/g) ?? []).length !== 2) failures.push("both scans must include canonical trailers");
  if (!/type:\s*typeFilter\s*\|\|\s*undefined/.test(page)) failures.push("filtered scan must keep server type scope");
  if (!/include_inactive:\s*includeInactive/.test(page)) failures.push("filtered scan must keep soft-delete scope");
  if (!/export async function listAllUnits[\s\S]*?while \(true\)[\s\S]*?offset \+= page\.units\.length/.test(api)) {
    failures.push("canonical unit scanner must exhaust stable pages");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const page = fs.readFileSync(path.join(root, PAGE), "utf8");
  const api = fs.readFileSync(path.join(root, API), "utf8");
  const mutations = [
    page.replace("listAllUnits({", "listUnits({"),
    page.replace('include: "trailers"', 'include: undefined'),
    page.replace("include_inactive: includeInactive", "include_inactive: false"),
    page.replace("type: typeFilter || undefined", "type: undefined"),
  ];
  if (check(page, api).length) process.exit(1);
  if (mutations.some((mutant) => check(mutant, api).length === 0)) process.exit(1);
  console.log("verify-fleet-table-complete-unified-roster: selftest PASS (4/4 mutations killed)");
  process.exit(0);
}

const failures = check(
  fs.readFileSync(path.join(root, PAGE), "utf8"),
  fs.readFileSync(path.join(root, API), "utf8")
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("verify-fleet-table-complete-unified-roster: PASS");

