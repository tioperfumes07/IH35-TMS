#!/usr/bin/env node
/**
 * LAY-01 — layout law ratchet (docs/lockdown/LAYOUT-LAW-2026-09-01.md).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-layout-law";

const FILES = {
  law: "docs/lockdown/LAYOUT-LAW-2026-09-01.md",
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  preDispatch: "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx",
  toolbarSegment: "apps/frontend/src/components/layout/ToolbarSegmentControl.tsx",
};

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

function inspect(src) {
  const errors = [];
  for (const token of ["space-y-3", "verify-no-nested-box", "ToolbarSegmentControl", "min-h-0"]) {
    if (!src.law.includes(token)) errors.push(`LAYOUT-LAW missing anchor: ${token}`);
  }
  if (!src.drivers.includes('className="space-y-3"')) errors.push("Drivers.tsx must use space-y-3 module shell");
  if (!src.dispatch.includes('className="space-y-3"')) errors.push("Dispatch.tsx must use space-y-3 module shell");
  if (
    /pre-dispatch-validation-entitylinks[\s\S]{0,400}rounded-sm border/.test(src.preDispatch) ||
    /rounded-sm border[\s\S]{0,400}pre-dispatch-validation-entitylinks/.test(src.preDispatch)
  ) {
    errors.push("PreDispatchValidationPanel entitylinks strip must stay flat inside Book Load frame");
  }
  if (!fs.existsSync(path.join(ROOT, FILES.toolbarSegment))) errors.push("missing ToolbarSegmentControl");
  const nested = spawnSync("node", ["scripts/verify-no-nested-box.mjs"], { cwd: ROOT, encoding: "utf8" });
  if (nested.status !== 0) errors.push("verify-no-nested-box must PASS (layout law §2)");
  return errors;
}

function mutateEntitylinksBorder(good) {
  const token = 'className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-[11px] text-slate-700"';
  if (!good.preDispatch.includes(token)) throw new Error("selftest anchor missing: flat entitylinks class");
  return {
    ...good,
    preDispatch: good.preDispatch.replace(
      token,
      'className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 px-2 py-1.5 text-[11px] text-slate-700"'
    ),
  };
}

function selftest() {
  const good = load();
  const baseline = inspect(good);
  if (baseline.length) throw new Error(`good fixture rejected: ${baseline.join("; ")}`);
  const bad = inspect(mutateEntitylinksBorder(good));
  if (!bad.some((e) => e.includes("entitylinks"))) throw new Error("planted bordered entitylinks did not redden");
  console.log(`${LABEL}: selftest PASS`);
}

const errors = inspect(load());
if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (err) {
    console.error(`${LABEL}: selftest FAIL — ${err.message}`);
    process.exit(1);
  }
} else if (errors.length) {
  console.error(`${LABEL}: FAIL\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
} else {
  console.log(`${LABEL}: PASS — LAYOUT-LAW doc + Drivers/Dispatch shells + flat dispatch validation strip`);
}
