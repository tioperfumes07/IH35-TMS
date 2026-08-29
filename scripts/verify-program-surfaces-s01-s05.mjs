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
  const finalAdditions = read("apps/frontend/src/pages/program/FinalAdditionsPage.tsx");
  const board = read("apps/frontend/src/pages/program/ProgramBoardPage.tsx");
  const boardService = read("apps/backend/src/program/program-board.service.ts");
  const required = JSON.parse(read("docs/specs/scoreboard/modules/program.required.json"));

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
  const threadLeaf = required.leaves.find((leaf) => leaf.id === "program.panel.thread");
  assert(threadLeaf?.route_hint === "/program/legacy-board", "program.panel.thread must point at its real Program Board route", errors);
  assert(threadLeaf?.surface_path === "pages/program/ProgramBoardPage.tsx", "program.panel.thread must name its real consumer", errors);

  // S03: module-completion page fetches API manifests (not the gitignored Vite bake).
  assert(moduleComp.includes("/api/v1/program/module-completion"), "ModuleCompletionPage must fetch /api/v1/program/module-completion", errors);
  assert(moduleComp.includes("buildRows"), "ModuleCompletionPage must build rows from manifests", errors);
  assert(!/import \{\s*MODULE_COMPLETION,/.test(moduleComp), "ModuleCompletionPage must not import baked MODULE_COMPLETION", errors);
  assert(moduleComp.includes("boardReady"), "ModuleCompletionPage must gate the table on a successful API board (no false 'not yet defined' on fetch error)", errors);
  assert(moduleComp.includes("live.isSuccess"), "ModuleCompletionPage boardReady must require live.isSuccess", errors);
  assert(moduleComp.includes("{boardReady ?"), "ModuleCompletionPage must not render the N-of-M table while the API board failed", errors);

  // S04: program tracker renders per-block status from registry.
  assert(tracker.includes("getProgramTracker"), "ProgramTrackerPage must fetch program tracker", errors);
  assert(tracker.includes("BlockTable"), "ProgramTrackerPage must render BlockTable", errors);
  assert(tracker.includes("status") && tracker.includes("pr"), "ProgramTrackerPage must show status and PR", errors);

  // Permanent no-owner-hold law: preserve historical GATED source tags, but never present them as
  // an active owner block or sort them behind actionable work.
  assert(!finalAdditions.includes("Gated (owner)"), "Final Additions must not label legacy GATED rows as owner-gated", errors);
  assert(!finalAdditions.includes("owner-blocked"), "Final Additions must not describe legacy GATED rows as owner-blocked", errors);
  assert(finalAdditions.includes('s.includes("GATED")) return 0'), "Final Additions must rank legacy GATED rows as actionable Pending", errors);
  assert(finalAdditions.includes("Pending (includes legacy GATED tags)"), "Final Additions must label the Pending denominator honestly", errors);
  assert(finalAdditions.includes("no owner approval is required"), "Final Additions must disclose that historical GATED tags require no owner approval", errors);

  // Same no-owner-hold disclosure on Program Tracker (Cascade LIVE FAIL #8015 / LV-PROGRAM-TRACKER-GATED-OWNER-HOLD-COPY).
  assert(!tracker.includes("Gated (owner)"), "Program Tracker must not label legacy GATED rows as owner-gated", errors);
  assert(tracker.includes("Historical GATED tag; no owner approval required"), "Program Tracker status must tooltip historical GATED as non-blocking", errors);
  assert(tracker.includes("no owner approval is required"), "Program Tracker must disclose historical GATED tags require no owner approval", errors);
  assert(tracker.includes("includes legacy GATED tags"), "Program Tracker pending denominator must mention legacy GATED tags", errors);

  // S05: program board has merged-PR tab.
  assert(board.includes('id: "merged"') || board.includes("merged"), "ProgramBoardPage must have merged tab", errors);
  assert(board.includes("merged_pr_total") || board.includes("recent_merged"), "ProgramBoardPage must show merged PR data", errors);
  assert(board.includes("mutateAsync"), "ProgramBoardPage notes must save via mutateAsync so a failed POST keeps the draft", errors);
  assert(!/onSubmit\(body\);\s*setValue\(""\)/.test(board), "AddNote must not clear the draft before the save resolves", errors);

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
  const finalPath = path.join(ROOT, "apps/frontend/src/pages/program/FinalAdditionsPage.tsx");
  const requiredPath = path.join(ROOT, "docs/specs/scoreboard/modules/program.required.json");
  const backup = fs.readFileSync(realPath, "utf8");
  const finalBackup = fs.readFileSync(finalPath, "utf8");
  const requiredBackup = fs.readFileSync(requiredPath, "utf8");
  try {
    fs.writeFileSync(realPath, backup.replace(/to="\/program\/modules"/, 'to="/program/_removed_modules"'), "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("/program/modules"))) {
      console.error("[verify-program-surfaces-s01-s05] SELFTEST FAIL: planted route removal not detected");
      process.exit(1);
    }
    fs.writeFileSync(finalPath, finalBackup.replace("Pending (includes legacy GATED tags)", "Gated (owner)"), "utf8");
    const ownerGatePlanted = run();
    if (!ownerGatePlanted.some((e) => e.includes("owner-gated")) || !ownerGatePlanted.some((e) => e.includes("Pending denominator"))) {
      console.error("[verify-program-surfaces-s01-s05] SELFTEST FAIL: planted owner-gate regression not detected");
      process.exit(1);
    }
    fs.writeFileSync(finalPath, finalBackup, "utf8");
    fs.writeFileSync(realPath, backup, "utf8");
    const trackerPath = path.join(ROOT, "apps/frontend/src/pages/program/ProgramTrackerPage.tsx");
    const trackerBackup = fs.readFileSync(trackerPath, "utf8");
    fs.writeFileSync(
      trackerPath,
      trackerBackup
        .replace("Historical GATED tag; no owner approval required", "Gated (owner)")
        .replace("no owner approval is required", "owner approval is required")
        .replace("includes legacy GATED tags", "Tracked pending"),
      "utf8",
    );
    const trackerPlanted = run();
    fs.writeFileSync(trackerPath, trackerBackup, "utf8");
    if (
      !trackerPlanted.some((e) => e.includes("Program Tracker")) ||
      !trackerPlanted.some((e) => e.includes("owner approval") || e.includes("legacy GATED") || e.includes("owner-gated"))
    ) {
      console.error("[verify-program-surfaces-s01-s05] SELFTEST FAIL: planted Program Tracker GATED regression not detected");
      process.exit(1);
    }
    const requiredJson = JSON.parse(requiredBackup);
    requiredJson.leaves.find((leaf) => leaf.id === "program.panel.thread").route_hint = "/program";
    fs.writeFileSync(requiredPath, JSON.stringify(requiredJson, null, 2), "utf8");
    const threadRoutePlanted = run();
    if (!threadRoutePlanted.some((e) => e.includes("program.panel.thread"))) {
      console.error("[verify-program-surfaces-s01-s05] SELFTEST FAIL: planted thread route mismatch not detected");
      process.exit(1);
    }
    console.log(`[verify-program-surfaces-s01-s05] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(realPath, backup, "utf8");
    fs.writeFileSync(finalPath, finalBackup, "utf8");
    fs.writeFileSync(requiredPath, requiredBackup, "utf8");
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
