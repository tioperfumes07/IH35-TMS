#!/usr/bin/env node
/** SAFETY-F6484 — Training Program create enums use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to TrainingProgramsPage");
  for (const id of ["training-program-category", "training-program-frequency"]) {
    if (!source.includes(`htmlFor="${id}"`) || !source.includes(`id="${id}"`) || !source.includes(`dataTestId="${id}"`)) {
      throw new Error(`missing associated/testable training control ${id}`);
    }
  }
  for (const token of [
    "category,",
    'frequency: frequency === "n_month" ? "n_month" : frequency',
    'frequency === "n_month" ? (',
    'setCategory(next as TrainingProgramCategory)',
    'setFrequency(next as TrainingProgramFrequency)',
  ]) if (!source.includes(token)) throw new Error(`missing Training Program create contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace('frequency: frequency === "n_month" ? "n_month" : frequency', 'frequency: "annual"');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6484_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted frequency payload miswire stayed green");
  console.log("verify-safety-training-program-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6484_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-training-program-comboboxes PASS — category/frequency preserve creator payload and N-month branch");
