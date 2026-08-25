#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["profiles.drawer.equipment_qualification","profiles.drawer.safety_event"],"task":"DRV-F6071-DRIVER-DETAIL-CATALOG-FAILURE-TRUTH","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-driver-detail-catalog-failure-truth";
const path = "apps/frontend/src/pages/DriverDetail.tsx";
const live = fs.readFileSync(path, "utf8");

function audit(source) {
  const failures = [];
  if (!/equipmentTypesQuery\.isError[\s\S]{0,220}equipmentTypesQuery\.refetch\(\)/.test(source)) failures.push("equipment types exact retry");
  if (!/ReferenceSelect[\s\S]{0,900}disabled=\{equipmentTypesQuery\.isError\}/.test(source)) failures.push("equipment selector fail closed");
  if (!/type="submit"[\s\S]{0,140}disabled=\{equipmentTypesQuery\.isError\}/.test(source)) failures.push("qualification save fail closed");
  if (!/terminationReasonsQuery\.isError[\s\S]{0,240}terminationReasonsQuery\.refetch\(\)/.test(source)) failures.push("termination reasons exact retry");
  if (!/termination_reason_id[\s\S]{0,1500}disabled=\{terminationReasonsQuery\.isError\}/.test(source)) failures.push("termination selector fail closed");
  if (!/usStatesQuery\.isError[\s\S]{0,420}title="Couldn't load US states"[\s\S]{0,420}usStatesQuery\.refetch\(\)/.test(source)) failures.push("US states exact retry");
  if (!/disabled=\{!editMode \|\| usStatesQuery\.isError\}/.test(source)) failures.push("US state selector fail closed");
  if (!/mexicoStatesQuery\.isError[\s\S]{0,420}title="Couldn't load Mexico states"[\s\S]{0,420}mexicoStatesQuery\.refetch\(\)/.test(source)) failures.push("Mexico states exact retry");
  if (!/disabled=\{!editMode \|\| mexicoStatesQuery\.isError\}/.test(source)) failures.push("Mexico state selector fail closed");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "onRetry={() => void equipmentTypesQuery.refetch()}",
    "disabled={equipmentTypesQuery.isError}",
    "onRetry={() => void terminationReasonsQuery.refetch()}",
    "disabled={terminationReasonsQuery.isError}",
    'title="Couldn\'t load US states"',
    "onRetry={() => void usStatesQuery.refetch()}",
    'title="Couldn\'t load Mexico states"',
    "onRetry={() => void mexicoStatesQuery.refetch()}",
  ];
  for (const needle of mutations) {
    const mutated = live.replace(needle, "");
    if (mutated === live || audit(mutated).length === 0) throw new Error(`planted defect escaped: ${needle}`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver qualification+termination catalogs recover exactly and fail closed`);
