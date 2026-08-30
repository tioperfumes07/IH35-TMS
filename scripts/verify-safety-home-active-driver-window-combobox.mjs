#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity","qbo_chrome"],"leaves":["home"],"task":"SAFETY-F6490-HOME-ACTIVE-DRIVER-WINDOW","vertical":"class-sweep"} */
/** SAFETY-F6490 — Safety Home activity window uses shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to SafetyHomeTab");
  for (const token of [
    'htmlFor="safety-home-active-drivers-window"',
    'id="safety-home-active-drivers-window"',
    'dataTestId="safety-home-active-drivers-window"',
    "value={String(activeDriverWindow)}",
    "ACTIVITY_WINDOW_OPTIONS.map",
    "setActiveDriverWindow(Number(next) as ActiveDriverSetThresholdDays)",
    'queryKey: ["safety", "active-driver-set", companyId, activeDriverWindow]',
    "getActiveDriverSet(companyId, activeDriverWindow)",
  ]) if (!source.includes(token)) throw new Error(`missing Safety Home activity-window contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("getActiveDriverSet(companyId, activeDriverWindow)", "getActiveDriverSet(companyId, 7)");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6490_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted constant activity window stayed green");
  console.log("verify-safety-home-active-driver-window-combobox --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6490_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-home-active-driver-window-combobox PASS — numeric threshold and query isolation preserved");
