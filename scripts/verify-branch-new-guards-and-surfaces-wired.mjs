#!/usr/bin/env node
/**
 * LEAD 443.314 — the SAME PR that adds a guard wires it; the SAME PR that adds a panel/modal/drawer gives it a Required leaf.
 *
 * Root cause (measured 10-24): the wiring census (verify-wiring-law-guard-registry-batch) and the Required-leaf inventory
 * (verify-required-surface-inventory-complete) ran ONLY in the pre-push verify-static sweep. Fast-merge (docs/bus/
 * FAST-MERGE-4MIN-LAW.md) authorizes --no-verify when that sweep fails on reds the branch did not cause, so a seat's own
 * unwired guard rode through with everyone else's reds; the census allowed 8 unaccounted, so main stayed green until the
 * 9th and then blocked every seat at once (10 unwired guards + 3 leafless panels in 18 h).
 *
 * This guard runs in money-pr-local-gate (step 1 — the one gate fast-merge never skips) and checks ONLY what this branch
 * ADDS vs origin/main:
 *   1. every added scripts/verify-*.mjs is wired (workflow, npm script run by CI, or a verify-step) or explicitly exempt;
 *   2. if the branch adds a *Panel / *Modal / *Drawer / *Wizard / *Sheet / *Dialog .tsx, the Required-leaf inventory
 *      guard must pass on this tree.
 * --selftest plants an unwired added guard and an added surface with a failing inventory and requires a FAIL.
 */
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-branch-new-guards-and-surfaces-wired";
const SURFACE_RE = /^apps\/frontend\/src\/.+(Panel|Modal|Drawer|Wizard|Sheet|Dialog)\.tsx$/;
const GUARD_RE = /^scripts\/verify-[^/]+\.mjs$/;

export function check({ added, wired, exempt, surfaceInventoryOk }) {
  const failures = [];
  for (const f of added.filter((f) => GUARD_RE.test(f))) {
    const base = path.basename(f);
    if (!wired.has(base) && !exempt.has(base)) {
      failures.push(`${base} is added by this branch but runs nowhere in CI — wire it in THIS PR (a scripts/verify-steps/* step or an npm script CI runs)`);
    }
  }
  const surfaces = added.filter((f) => SURFACE_RE.test(f));
  if (surfaces.length && !surfaceInventoryOk()) {
    failures.push(`this branch adds ${surfaces.map((s) => path.basename(s)).join(", ")} without a Required leaf — add it to docs/specs/scoreboard/modules/<module>.required.json in THIS PR (node scripts/verify-required-surface-inventory-complete.mjs)`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const base = { wired: new Set(["verify-a.mjs"]), exempt: new Set(), surfaceInventoryOk: () => true };
  const cases = [
    [{ ...base, added: ["scripts/verify-a.mjs"] }, 0, "wired added guard passes"],
    [{ ...base, added: ["scripts/verify-unwired.mjs"] }, 1, "unwired added guard fails"],
    [{ ...base, added: ["scripts/verify-unwired.mjs"], exempt: new Set(["verify-unwired.mjs"]) }, 0, "exempt guard passes"],
    [{ ...base, added: ["apps/frontend/src/pages/x/FooPanel.tsx"], surfaceInventoryOk: () => false }, 1, "leafless panel fails"],
    [{ ...base, added: ["apps/frontend/src/pages/x/FooPanel.tsx"] }, 0, "panel with leaf passes"],
    [{ ...base, added: ["apps/frontend/src/pages/x/foo.ts"], surfaceInventoryOk: () => false }, 0, "non-surface file ignored"],
  ];
  for (const [input, want, label] of cases) {
    const got = check(input).length;
    if ((got > 0 ? 1 : 0) !== want) { console.error(`${LABEL} SELFTEST FAIL: ${label} (got ${got} failures)`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

let added = [];
try {
  const mb = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  added = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${mb}...HEAD`], { cwd: ROOT, encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`${LABEL}: FAIL — cannot diff against origin/main (${String(e.message).split("\n")[0]})`);
  process.exit(1);
}
if (!added.some((f) => GUARD_RE.test(f) || SURFACE_RE.test(f))) {
  console.log(`${LABEL}: PASS — this branch adds no guard and no panel/modal/drawer`);
  process.exit(0);
}
const { classifyGuards } = await import("./verify-guard-wired.mjs");
const c = classifyGuards();
const failures = check({
  added,
  wired: new Set(c.fullyWired),
  exempt: new Set(c.exempted),
  surfaceInventoryOk: () =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts/verify-required-surface-inventory-complete.mjs")], { cwd: ROOT, encoding: "utf8" }).status === 0,
});
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — every guard and surface this branch adds is wired`);
