#!/usr/bin/env node
/** SAFETY-F6482 — D&A schedule/create/history enum controls use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  schedule: "apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx",
  tab: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
};
const disk = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function assertContract(source) {
  for (const [key, text] of Object.entries(source)) if (/<select\b/.test(text)) throw new Error(`native D&A select returned to ${key}`);
  for (const [key, ids] of Object.entries({
    schedule: ["schedule-test-type", "schedule-test-kind"],
    tab: ["record-test-type", "record-test-result", "drug-history-type", "drug-history-result"],
  })) for (const id of ids) {
    if (!source[key].includes(`htmlFor="${id}"`) || !source[key].includes(`id="${id}"`)) throw new Error(`missing associated D&A Combobox ${id}`);
  }
  for (const token of ["test_type: testType", "test_kind: testKind", "driver_uuid: driverUuid"]) {
    if (!source.schedule.includes(token)) throw new Error(`missing schedule payload contract: ${token}`);
  }
  for (const token of [
    "createDrugProgramTest",
    "test_type: testType",
    "result: testResult",
    'onClick={stagedHistory.apply}',
    'type: next ?? ""',
    'result: next ?? ""',
  ]) if (!source.tab.includes(token)) throw new Error(`missing D&A create/history contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = { ...disk, schedule: disk.schedule.replace("test_kind: testKind", "test_kind: 'drug'") };
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6482_SCHEDULE: planted.schedule, SAFETY_F6482_TAB: planted.tab },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted schedule kind miswire stayed green");
  console.log("verify-safety-drug-alcohol-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract({ schedule: process.env.SAFETY_F6482_SCHEDULE ?? disk.schedule, tab: process.env.SAFETY_F6482_TAB ?? disk.tab });
console.log("verify-safety-drug-alcohol-comboboxes PASS — 6 associated controls preserve schedule/create/history wiring");
