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
  if (!source.schedule.includes("mutation.isError && mutation.variables?.generation === lifecycleGenerationRef.current")) {
    throw new Error("stale D&A schedule rejection can paint the next company context");
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
  const mutations = [
    ["test_kind: testKind", "test_kind: 'drug'"],
    ["mutation.isError && mutation.variables?.generation === lifecycleGenerationRef.current", "mutation.isError"],
  ];
  for (const [from, to] of mutations) {
    const planted = { ...disk, schedule: disk.schedule.replace(from, to) };
    if (planted.schedule === disk.schedule) throw new Error(`selftest fixture missing: ${from}`);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      env: { ...process.env, SAFETY_F6482_SCHEDULE: planted.schedule, SAFETY_F6482_TAB: planted.tab },
      encoding: "utf8",
    });
    if (child.status === 0) throw new Error(`selftest failed: mutation stayed green: ${from}`);
  }
  console.log(`verify-safety-drug-alcohol-comboboxes --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

assertContract({ schedule: process.env.SAFETY_F6482_SCHEDULE ?? disk.schedule, tab: process.env.SAFETY_F6482_TAB ?? disk.tab });
console.log("verify-safety-drug-alcohol-comboboxes PASS — 6 associated controls preserve schedule/create/history wiring");
