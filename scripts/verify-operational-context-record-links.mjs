#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","cash-flow"],"cols":["driver","unit","load","liability","connectivity"],"leafRe":"^(unit\\.profile\\.current_load|tab\\.daily_prediction)$","task":"LINK-F5144-OPERATIONAL-CONTEXT-RECORD-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  currentLoad: "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  cashFlow: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
  liabilities: "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx",
  matrix: "docs/specs/scoreboard/modules/settlements.required.json",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("currentLoad", 'data-testid="available-unit-record-link"', "empty current-load context must drill back to its unit");
  need("currentLoad", 'kind="unit" id={unitId}', "available context must use the canonical unit id");
  need("currentLoad", 'data-testid="vp-current-load-customer-link"', "active current-load must drill to its customer");
  need("currentLoad", 'kind="customer"', "active current-load customer must use EntityLinkOrTombstone kind=customer");
  need("currentLoad", 'data-testid="vp-current-load-link"', "active current-load must drill to its load");
  need("cashFlow", 'data-testid="cash-flow-predicted-load-link"', "daily prediction load identity must expose a canonical href");
  need("cashFlow", '<EntityLinkOrTombstone\n                      kind="load"\n                      id={item.load_id}\n                      name={item.load_number}', "daily prediction must use its persisted load id and human label through an unresolved-safe drill");
  need("liabilities", 'data-testid="liability-roster-record-link"', "liability roster primary identity must drill through");
  need("liabilities", 'kind="liability" id={String(row.id)}', "liability roster must normalize its canonical id");
  let matrix;
  try { matrix = JSON.parse(source.matrix); } catch (error) { failures.push(`settlements matrix must parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "liabilities.list");
  if (!leaf?.required?.includes("reverse_link")) failures.push("liabilities.list must require reverse_link");
  if (leaf?.route_hint !== "/liabilities") failures.push("liabilities.list must name the mounted route");
  return failures;
}
const source = read();
const failures = verify(source);
if (failures.length) { console.error("operational context record-link guard failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["currentLoad", 'data-testid="available-unit-record-link"', 'data-testid="broken-unit-link"'],
    ["currentLoad", 'kind="unit" id={unitId}', 'kind="load" id={unitId}'],
    ["currentLoad", 'data-testid="vp-current-load-customer-link"', 'data-testid="broken-customer-link"'],
    ["currentLoad", 'kind="customer"', 'kind="vendor"'],
    ["currentLoad", 'data-testid="vp-current-load-link"', 'data-testid="broken-load-link"'],
    ["cashFlow", 'data-testid="cash-flow-predicted-load-link"', 'data-testid="broken-load-link"'],
    ["cashFlow", '<EntityLinkOrTombstone\n                      kind="load"\n                      id={item.load_id}\n                      name={item.load_number}', '<EntityLinkOrTombstone\n                      kind="unit"\n                      id={item.load_id}\n                      name={null}'],
    ["liabilities", 'data-testid="liability-roster-record-link"', 'data-testid="broken-liability-link"'],
    ["liabilities", 'id={String(row.id)}', 'id={undefined}'],
    ["matrix", '"id": "liabilities.list"', '"id": "liabilities.list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: operational context records drill through across Fleet, Cash Flow, and Settlements");
