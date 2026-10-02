#!/usr/bin/env node
/**
 * No tracked source file may carry git merge-conflict markers. 2026-10-02: a squash merge (#23954) landed
 * `<<<<<<< HEAD` / `>>>>>>> origin/main` in apps/backend/src/mdata/canonical/canonical-entities.routes.ts; the backend
 * stopped compiling and every Render deploy after it failed at build. Scans source + scripts + migrations with
 * `git grep` (line-start markers only, so markdown underlines and prose never match). Static, < 1 s.
 */
import { execFileSync } from "node:child_process";
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
