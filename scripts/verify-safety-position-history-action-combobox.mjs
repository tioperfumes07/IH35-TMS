#!/usr/bin/env node
/** SAFETY-F6488 — Position History action uses shared staged Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to PositionHistoryPage");
  for (const token of [
    'htmlFor="position-history-action-filter"',
    'id="position-history-action-filter"',
    'dataTestId="position-history-action-filter"',
    "action: next as ActionFilter",
    "action: applied.action || undefined",
    "patchSearchParam(next)",
    "onClick={staged.apply}",
    "onClick={staged.cancel}",
    "setApplied(EMPTY_FILTERS)",
    "patchSearchParam(EMPTY_FILTERS)",
  ]) if (!source.includes(token)) throw new Error(`missing Position History action contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("patchSearchParam(next)", "patchSearchParam(EMPTY_FILTERS)");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6488_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted URL reset stayed green");
  console.log("verify-safety-position-history-action-combobox --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6488_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-position-history-action-combobox PASS — staged Apply and URL persistence preserved");
