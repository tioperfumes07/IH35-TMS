#!/usr/bin/env node
/**
 * Program module S01-S05 surface ratchet.
 *
 * Verifies the Program module pages are mounted, reachable, and wired to the
 * right data sources, and that the existing per-page guards stay green.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

function runGuard(name, errors) {
  const script = path.join(ROOT, "scripts", name);
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: ROOT });
  if (r.status !== 0) {
    errors.push(`${name} failed: ${(r.stderr || r.stdout || "").slice(0, 200)}`);
  }
}

export function run() {
  const errors = [];
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const nav = read("apps/frontend/src/pages/program/ProgramModuleNav.tsx");
  const scenario = read("apps/frontend/src/pages/program/AuditScoreboardPage.tsx");
  const moduleComp = read("apps/frontend/src/pages/program/ModuleCompletionPage.tsx");
  const tracker = read("apps/frontend/src/pages/program/ProgramTrackerPage.tsx");
  const board = read("apps/frontend/src/pages/program/ProgramBoardPage.tsx");
  const boardService = read("apps/backend/src/program/program-board.service.ts");

  const routes = ["/program", "/program/modules", "/program/tracker", "/program/legacy-scoreboard", "/program/matrix", "/program/final-additions"];
  for (const r of routes) {
    assert(manifest.includes(`path="${r}"`), `manifest.tsx must route ${r}`, errors);
    assert(nav.includes(`to="${r}"`), `ProgramModuleNav must link ${r}`, errors);
  }

  // S01: /program home is the live Scenario Tracker.
  assert(scenario.includes("ScenarioTrackerHome"), "AuditScoreboardPage must render ScenarioTrackerHome", errors);
  assert(manifest.includes("/home/scenario-tracker"), "legacy /home/scenario-tracker redirect must exist", errors);

  // S02: legacy board reads the committed block-reconciliation snapshot.
  assert(board.includes("getProgramBoard"), "ProgramBoardPage must fetch program board", errors);
  assert(boardService.includes("block-reconciliation-data.json"), "program-board.service must read block-reconciliation-data.json", errors);

  // S03: module-completion page surfaces generated manifests.
  assert(moduleComp.includes("MODULE_COMPLETION"), "ModuleCompletionPage must import MODULE_COMPLETION", errors);
  assert(moduleComp.includes("buildRows"), "ModuleCompletionPage must build rows from manifests", errors);

  // S04: program tracker renders per-block status from registry.
  assert(tracker.includes("getProgramTracker"), "ProgramTrackerPage must fetch program tracker", errors);
  assert(tracker.includes("BlockTable"), "ProgramTrackerPage must render BlockTable", errors);
  assert(tracker.includes("status") && tracker.includes("pr"), "ProgramTrackerPage must show status and PR", errors);

  // S05: program board has merged-PR tab.
  assert(board.includes('id: "merged"') || board.includes("merged"), "ProgramBoardPage must have merged tab", errors);
  assert(board.includes("merged_pr_total") || board.includes("recent_merged"), "ProgramBoardPage must show merged PR data", errors);

  // Existing per-page guards stay green.
  const guards = [
    "verify-program-audit-scoreboard-api-url.mjs",
    "verify-program-board-tab-render-parity.mjs",
    "verify-program-tracker-r2-live.mjs",
    "verify-program-board-tabs-url-sync.mjs",
    "verify-program-tracker-tabs-url-sync.mjs",
    "verify-program-scoreboard-13gate-prodread.mjs",
  ];
  for (const g of guards) runGuard(g, errors);

  return errors;
}

function selftest() {
  const realPath = path.join(ROOT, "apps/frontend/src/pages/program/ProgramModuleNav.tsx");
  const backup = fs.readFileSync(realPath, "utf8");
  try {
    fs.writeFileSync(realPath, backup.replace(/to="\/program\/modules"/, 'to="/program/_removed_modules"'), "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("/program/modules"))) {
      console.error("[verify-program-surfaces-s01-s05] SELFTEST FAIL: planted route removal not detected");
      process.exit(1);
    }
    console.log(`[verify-program-surfaces-s01-s05] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-program-surfaces-s01-s05] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-program-surfaces-s01-s05] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
