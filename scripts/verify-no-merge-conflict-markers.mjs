#!/usr/bin/env node
/**
 * No tracked source file may carry git merge-conflict markers. 2026-10-02: a squash merge (#23954) landed
 * `<<<<<<< HEAD` / `>>>>>>> origin/main` in apps/backend/src/mdata/canonical/canonical-entities.routes.ts; the backend
 * stopped compiling and every Render deploy after it failed at build. Scans source + scripts + migrations with
 * `git grep` (line-start markers only, so markdown underlines and prose never match). Static, < 1 s.
 */
import { execFileSync } from "node:child_process";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_no_merge_conflict_markers(); }
async function selftest_verify_no_merge_conflict_markers() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_no_merge_conflict_markers", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}
let out = "";
try {
  out = execFileSync("git", ["grep", "-n", "-I", "-E", "^(<<<<<<< |>>>>>>> |\\|\\|\\|\\|\\|\\|\\| )", "--",
    "apps", "scripts", "db/migrations", "packages", ":!**/*.md", ":!scripts/verify-no-merge-conflict-markers.mjs"], { encoding: "utf8" });
} catch (e) {
  if (e.status === 1) { console.log("verify-no-merge-conflict-markers: OK — 0 conflict markers in tracked source"); process.exit(0); }
  throw e;
}
console.error("verify-no-merge-conflict-markers: FAIL — merge-conflict markers in tracked source:\n" + out.trim().split("\n").slice(0, 40).map((l) => "  " + l).join("\n"));
process.exit(1);
