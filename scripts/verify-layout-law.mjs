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

// LEAD 443.98 ruling (2026-10-12) — module-shell check.
//   old rule: the page must contain the exact string className="space-y-3".
//   new rule: some className on the page carries the space-y-3 token and that same className mixes in no
//             other space-y-* gap (LAYOUT-LAW §1: "Section gap is 12px (space-y-3), not mixed").
//   why: #23137 added responsive overflow classes to the Dispatch root
//        (className="min-w-0 max-w-full space-y-3 overflow-x-hidden"). The 12px shell is intact, but the
//        exact-string match could no longer see it, so the selftest rejected the real good page. Not looser:
//        a shell with the gap removed or changed still fails, and a mixed gap on the shell now also fails.
export function hasModuleShell(page) {
  for (const m of page.matchAll(/className="([^"]*)"/g)) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes("space-y-3") && !tokens.some((t) => /^space-y-/.test(t) && t !== "space-y-3")) return true;
  }
  return false;
}

function inspect(src, { nestedBoxPasses = runNestedBox } = {}) {
  const errors = [];
  for (const token of ["space-y-3", "verify-no-nested-box", "ToolbarSegmentControl", "min-h-0"]) {
    if (!src.law.includes(token)) errors.push(`LAYOUT-LAW missing anchor: ${token}`);
  }
  if (!hasModuleShell(src.drivers)) errors.push("Drivers.tsx must use space-y-3 module shell");
  if (!hasModuleShell(src.dispatch)) errors.push("Dispatch.tsx must use space-y-3 module shell");
  if (
    /pre-dispatch-validation-entitylinks[\s\S]{0,400}rounded-sm border/.test(src.preDispatch) ||
    /rounded-sm border[\s\S]{0,400}pre-dispatch-validation-entitylinks/.test(src.preDispatch)
  ) {
    errors.push("PreDispatchValidationPanel entitylinks strip must stay flat inside Book Load frame");
  }
  if (!fs.existsSync(path.join(ROOT, FILES.toolbarSegment))) errors.push("missing ToolbarSegmentControl");
  if (!nestedBoxPasses()) errors.push("verify-no-nested-box must PASS (layout law §2)");
  return errors;
}

function runNestedBox() {
  const nested = spawnSync("node", ["scripts/verify-no-nested-box.mjs"], { cwd: ROOT, encoding: "utf8" });
  return nested.status === 0;
}

function mutateEntitylinksBorder(good) {
  // Anchor on the strip's test id, not its exact class string — the palette sweep (#25891) rewrote the
  // colours, which broke a literal-class anchor without changing the flat strip.
  const re = /className="([^"]*)\bborder-t\b([^"]*)"(\s*data-testid="pre-dispatch-validation-entitylinks")/;
  if (!re.test(good.preDispatch)) throw new Error("selftest anchor missing: flat entitylinks strip (border-t + test id)");
  return { ...good, preDispatch: good.preDispatch.replace(re, 'className="$1rounded-sm border$2"$3') };
}

function selftest() {
  const good = load();
  const baseline = inspect(good);
  if (baseline.length) throw new Error(`good fixture rejected: ${baseline.join("; ")}`);
  const pass = () => true;
  const dispatchRoot = /<div className="[^"]*space-y-3[^"]*"/.exec(good.dispatch)?.[0];
  if (!dispatchRoot) throw new Error("selftest anchor missing: Dispatch space-y-3 shell");
  const planted = [
    ["bordered entitylinks strip", inspect(mutateEntitylinksBorder(good), { nestedBoxPasses: pass }), "entitylinks"],
    ["Dispatch shell gap changed to space-y-6", inspect({ ...good, dispatch: good.dispatch.replaceAll("space-y-3", "space-y-6") }, { nestedBoxPasses: pass }), "Dispatch.tsx"],
    ["Dispatch shell mixes space-y-3 with space-y-4", inspect({ ...good, dispatch: good.dispatch.replaceAll(/className="([^"]*)space-y-3([^"]*)"/g, 'className="$1space-y-3 space-y-4$2"') }, { nestedBoxPasses: pass }), "Dispatch.tsx"],
    ["Drivers shell removed", inspect({ ...good, drivers: good.drivers.replaceAll("space-y-3", "") }, { nestedBoxPasses: pass }), "Drivers.tsx"],
    ["law loses the nested-box anchor", inspect({ ...good, law: good.law.replaceAll("verify-no-nested-box", "") }, { nestedBoxPasses: pass }), "LAYOUT-LAW"],
    ["nested box ratchet red", inspect(good, { nestedBoxPasses: () => false }), "verify-no-nested-box"],
  ];
  let caught = 0;
  for (const [name, errs, needle] of planted) {
    if (errs.some((e) => e.includes(needle))) caught += 1;
    else console.error(`${LABEL}: selftest planted violation escaped — ${name}`);
  }
  if (caught !== planted.length) throw new Error(`${planted.length - caught} planted violation(s) escaped`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught (real pages pass)`);
}

let errors = [];
if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (err) {
    console.error(`${LABEL}: selftest FAIL — ${err.message}`);
    process.exit(1);
  }
} else if ((errors = inspect(load())).length) {
  console.error(`${LABEL}: FAIL\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
} else {
  console.log(`${LABEL}: PASS — LAYOUT-LAW doc + Drivers/Dispatch shells + flat dispatch validation strip`);
}
