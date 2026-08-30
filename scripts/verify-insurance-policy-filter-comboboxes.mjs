#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const file = path.join(process.cwd(), "apps/frontend/src/pages/insurance/PoliciesList.tsx");
function failures(source) {
  const found = [];
  const typeFilterStart = source.indexOf('<label htmlFor="insurance-policies-type-filter">');
  const statusFilterStart = source.indexOf('<label htmlFor="insurance-policies-status-filter">');
  const typeFilter = typeFilterStart < 0 || statusFilterStart < 0
    ? ""
    : source.slice(typeFilterStart, statusFilterStart);
  if (/<select\b/.test(source)) found.push("Policies list retains native filter select");
  for (const id of ["insurance-policies-type-filter", "insurance-policies-status-filter"]) {
    if (!source.includes(`htmlFor="${id}"`)) found.push(`missing label ${id}`);
    if (!source.includes(`<Combobox\n`) || !source.includes(`id="${id}"`)) found.push(`missing Combobox ${id}`);
  }
  if (!typeFilter.includes("typesQuery.isError ?")) found.push("type-catalog failure is not branched");
  if (!typeFilter.includes('title="Couldn\'t load coverage types"')) found.push("type-catalog failure is not visible");
  if (!typeFilter.includes("onRetry={() => void typesQuery.refetch()}")) found.push("type-catalog failure lacks exact Retry");
  return found;
}
const source = fs.readFileSync(file, "utf8");
const found = failures(source);
if (found.length) { console.error(found.map((item) => `FAIL: ${item}`).join("\n")); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("{typesQuery.isError ? (", "{false ? ("),
    source.replace("onRetry={() => void typesQuery.refetch()}", "onRetry={() => undefined}"),
    source.replace('id="insurance-policies-status-filter"', 'id="insurance-policies-filter"'),
  ];
  if (mutations.some((mutation) => failures(mutation).length === 0)) { console.error("FAIL: planted filter defect escaped"); process.exit(1); }
  console.log("PASS: 3/3 planted Insurance filter defects caught");
}
console.log("PASS: Insurance policy filters use associated Comboboxes and disclose type-catalog failure");
