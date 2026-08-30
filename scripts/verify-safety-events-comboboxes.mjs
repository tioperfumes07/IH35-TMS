#!/usr/bin/env node
/** SAFETY-F6483 — Safety Events filter/create enums use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");
const IDS = [
  "safety-events-status-filter", "safety-events-severity-filter", "safety-events-type-filter",
  "safety-event-kpi-bucket", "safety-event-severity", "safety-event-status", "safety-event-subject-type",
];

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to SafetyEventsPage");
  for (const id of IDS) if (!source.includes(`id="${id}"`)) throw new Error(`missing Safety Events Combobox ${id}`);
  for (const id of IDS.slice(3)) if (!source.includes(`htmlFor="${id}"`)) throw new Error(`missing create label association ${id}`);
  for (const token of [
    'dataTestId="safety-events-type-filter"',
    'onClick={staged.apply}',
    'kpi_bucket: input.draft.kpi_bucket',
    'subject_type: input.draft.subject_type',
    'severity: input.draft.severity',
    'status: input.draft.status',
  ]) if (!source.includes(token)) throw new Error(`missing Safety Events filter/create contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["subject type", "subject_type: input.draft.subject_type", "subject_type: 'company'"],
    ["KPI bucket", "kpi_bucket: input.draft.kpi_bucket", "kpi_bucket: 'incidents'"],
    ["severity", "severity: input.draft.severity", "severity: 'low'"],
    ["status", "status: input.draft.status", "status: 'open'"],
  ];
  for (const [name, from, to] of mutations) {
    const planted = diskSource.replace(from, to);
    if (planted === diskSource) throw new Error(`selftest failed to plant ${name}`);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      env: { ...process.env, SAFETY_F6483_PLANTED_SOURCE: planted },
      encoding: "utf8",
    });
    if (child.status === 0) throw new Error(`selftest failed: planted ${name} payload miswire stayed green`);
  }
  console.log(`verify-safety-events-comboboxes --selftest PASS — ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

assertContract(process.env.SAFETY_F6483_PLANTED_SOURCE ?? diskSource);
console.log(`verify-safety-events-comboboxes PASS — ${IDS.length} controls preserve staged filters + create payload`);
