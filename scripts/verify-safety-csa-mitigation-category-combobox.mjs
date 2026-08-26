#!/usr/bin/env node
/** SAFETY-F6487 — CSA mitigation creator category uses shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to CSAMitigationQueue");
  for (const token of [
    'htmlFor="csa-mitigation-category"',
    'id="csa-mitigation-category"',
    'dataTestId="csa-mitigation-category"',
    "Object.entries(BASIC_LABELS).map",
    "setBasicCategory(next as BasicCategory)",
    "createAction(input.companyId, input.category, input.dueDate)",
    "basic_category: basicCategory",
  ]) if (!source.includes(token)) throw new Error(`missing CSA mitigation creator contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("basic_category: basicCategory", 'basic_category: "unsafe_driving"');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6487_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted constant category payload stayed green");
  console.log("verify-safety-csa-mitigation-category-combobox --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6487_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-csa-mitigation-category-combobox PASS — canonical BASIC payload preserved");
