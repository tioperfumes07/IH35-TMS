#!/usr/bin/env node
/** SAFETY-F6491 — Driver Safety Cards sort uses shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/components/safety/DriverSafetyCards.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to DriverSafetyCards");
  for (const token of [
    'htmlFor="driver-cards-sort"',
    'id="driver-cards-sort"',
    'dataTestId="driver-cards-sort"',
    "sortOptions.map",
    "setSort(next as CardSort)",
    'if (sort === "name")',
    'if (sort === "soonest")',
    "b.riskScore - a.riskScore",
  ]) if (!source.includes(token)) throw new Error(`missing Driver Safety Cards sort contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("b.riskScore - a.riskScore", "a.riskScore - b.riskScore");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6491_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted inverted risk sort stayed green");
  console.log("verify-driver-safety-cards-sort-combobox --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6491_PLANTED_SOURCE ?? diskSource);
console.log("verify-driver-safety-cards-sort-combobox PASS — risk/expiry/name comparators preserved");
