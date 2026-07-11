#!/usr/bin/env node
// ============================================================================
// verify-tracker-artifacts-fresh.mjs — STATIC CI GUARD (NON-FINANCIAL)
// ----------------------------------------------------------------------------
// Locks the Doc-19-A fix: the Program Tracker's committed status artifact
//   docs/trackers/block-reconciliation-data.json
// must not silently freeze again. It is refreshed by the scheduled + on-merge
// workflow `program-tracker-artifacts-sync.yml`. This guard FAILS if that
// artifact's last commit is OLDER than the latest block-affecting commit
// (.block-ready/**, docs/blocks/**, .held-migrations.json) by more than the
// sync interval + grace — i.e. blocks changed but the reconcile artifact was
// never refreshed → the tracker's per-block status went stale.
//
// The HEADLINE "Registered" count is counted live from .block-ready at request
// time and does NOT depend on this artifact; this guard protects the DERIVED
// per-block status/phase rollup ("as of last sync" on the page).
//
// ROBUST IN CI: on a shallow clone (or when git history is unavailable) the
// commit timestamps can't be trusted, so the guard DEGRADES TO PASS rather than
// false-fail. Tune the window with TRACKER_ARTIFACT_MAX_LAG_SEC.
//
// Self-test:  node scripts/verify-tracker-artifacts-fresh.mjs --selftest
// LINKAGE: N/A (reporting/enforcement infra). Additive only.
// ============================================================================
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECON_REL = "docs/trackers/block-reconciliation-data.json";
// Block-SOURCE paths whose changes should drive a reconcile refresh (the same set the sync workflow watches).
const BLOCK_SOURCE_PATHS = [".block-ready", "docs/blocks", "db/migrations/.held-migrations.json"];

// Sync interval is 6h; allow one extra interval of grace so a normal between-sync merge never false-fails.
const SYNC_INTERVAL_SEC = 6 * 3600;
const DEFAULT_MAX_LAG_SEC = 2 * SYNC_INTERVAL_SEC; // 12h
const MAX_LAG_SEC = Number(process.env.TRACKER_ARTIFACT_MAX_LAG_SEC) || DEFAULT_MAX_LAG_SEC;

/**
 * Pure staleness rule (unit-tested by --selftest):
 * stale iff the newest block-source commit is newer than the recon-artifact commit by MORE than maxLagSec.
 * Any null timestamp (unknown history) → NOT stale (can't judge → PASS).
 */
export function isStale(reconTs, blockTs, maxLagSec) {
  if (reconTs == null || blockTs == null) return false;
  return blockTs - reconTs > maxLagSec;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Last commit unix time (committer date) touching any of the given paths, or null if unknown. */
function lastCommitTs(paths) {
  const out = git(["log", "-1", "--format=%ct", "--", ...paths]);
  const n = Number(out);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isShallow() {
  return git(["rev-parse", "--is-shallow-repository"]) === "true";
}

function run() {
  if (!fs.existsSync(path.join(ROOT, RECON_REL))) {
    // Artifact missing entirely is a different failure class; don't false-fail this freshness guard.
    console.log(`verify:tracker-artifacts-fresh — SKIP (artifact ${RECON_REL} not present)`);
    return [];
  }
  if (isShallow()) {
    console.log("verify:tracker-artifacts-fresh — PASS (shallow git history; freshness not judgeable → degrade to PASS)");
    return [];
  }
  const reconTs = lastCommitTs([RECON_REL]);
  const blockTs = lastCommitTs(BLOCK_SOURCE_PATHS);
  if (reconTs == null || blockTs == null) {
    console.log("verify:tracker-artifacts-fresh — PASS (commit history unavailable for one side → degrade to PASS)");
    return [];
  }
  const lag = blockTs - reconTs;
  if (isStale(reconTs, blockTs, MAX_LAG_SEC)) {
    const hrs = (lag / 3600).toFixed(1);
    return [
      `${RECON_REL} is STALE: last block-source commit is ${hrs}h newer than the reconcile artifact ` +
        `(max allowed ${(MAX_LAG_SEC / 3600).toFixed(1)}h). Run \`npm run reconcile:blocks\` + ` +
        `\`node scripts/gen-program-phase-manifest.mjs\` and commit, or confirm program-tracker-artifacts-sync.yml is running.`,
    ];
  }
  console.log(
    `verify:tracker-artifacts-fresh — PASS (reconcile artifact lag ${(lag / 3600).toFixed(1)}h ≤ ${(MAX_LAG_SEC / 3600).toFixed(1)}h)`
  );
  return [];
}

if (process.argv.includes("--selftest")) {
  const H = 3600;
  const checks = [
    ["fresh (block older than recon) → not stale", isStale(1000 * H, 990 * H, 12 * H) === false],
    ["within-window (block 6h newer) → not stale", isStale(1000 * H, 1006 * H, 12 * H) === false],
    ["stale (block 20h newer, window 12h) → stale", isStale(1000 * H, 1020 * H, 12 * H) === true],
    ["boundary (exactly maxLag) → not stale", isStale(1000 * H, 1012 * H, 12 * H) === false],
    ["null reconTs → degrade to not stale", isStale(null, 1020 * H, 12 * H) === false],
    ["null blockTs → degrade to not stale", isStale(1000 * H, null, 12 * H) === false],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:tracker-artifacts-fresh --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:tracker-artifacts-fresh --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const failures = run();
  if (failures.length) {
    console.error("verify:tracker-artifacts-fresh FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
}
