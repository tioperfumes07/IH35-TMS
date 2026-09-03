#!/usr/bin/env node
/**
 * generate-gate-step-map.mjs — GATE-LIVELOCK-01 (owner 2026-09-03).
 *
 * WHY: scripts/verify-static.mjs globs and runs every scripts/verify-*.mjs (4,767 steps
 * including selftests) unconditionally on every local pre-push. Measured 2026-09-03: 150 steps
 * in 100s => ~3,180s (53min) total, while origin/main advances one commit every ~225s. A push
 * that takes 53min to gate always finds main has moved (and often overlapped) by the time the
 * gate finishes, so branch-precheck-push.mjs's freshness-by-overlap check rejects it — a
 * livelock, not slowness: every rebuild takes another 53min, during which main moves again.
 *
 * WHAT THIS DOES: statically scans each top-level scripts/verify-*.mjs guard for path-shaped
 * string literals under apps/, db/, docs/, scripts/ (the four top-level dirs a guard could
 * plausibly own) and records them as that guard's "owned paths". A LOCAL pre-push run (never
 * CI — CI globs the full unchanged set, see verify-static.mjs's own default) can then skip a
 * guard whose owned paths do not intersect the current push's changed-file set.
 *
 * FAIL SAFE, NEVER FAIL SILENT: a guard with NO extractable path is marked `alwaysRun: true` and
 * runs on every push regardless of diff -- extraction failing to find a path is treated as "this
 * guard could own anything", not as "this guard owns nothing". Extraction is intentionally
 * generous (any path-shaped literal anywhere in the file, comments included) -- a false-positive
 * owned path just means the guard runs when it did not strictly need to (safe); a false-negative
 * (missing a real owned path) means a guard could wrongly skip (unsafe), so the regex favours
 * over-matching.
 *
 * Regenerates automatically when the scripts/ directory's guard-file set or content changes
 * (tracked via `scriptsDirHash` -- consumers must check this against a fresh hash and regenerate
 * rather than trust a stale map).
 *
 * Usage: node scripts/generate-gate-step-map.mjs [--check]
 *   --check: exit 1 if the committed map is stale (used by a CI/guard step, not by pre-push
 *   itself -- pre-push always regenerates in-process via ensureFreshGateStepMap()).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, "..");
export const GATE_STEP_MAP_PATH = path.join(SCRIPTS_DIR, ".gate-step-map.json");

const SELF_NAME = "verify-static.mjs"; // excluded: the runner is not one of its own steps
const NON_STATIC_ORCHESTRATORS = new Set(["verify-local-ci.mjs"]);

// Any quoted literal beginning with one of these top-level dirs. Deliberately loose (comments,
// string concatenation targets, glob roots) -- see the "fail safe" note above.
const PATH_LITERAL_RE = /["'`](apps|db|docs|scripts)\/[A-Za-z0-9_.\/*-]*["'`]/g;

export function listGuardFiles(dir = SCRIPTS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^verify-.*\.mjs$/.test(f) && f !== SELF_NAME && !NON_STATIC_ORCHESTRATORS.has(f))
    .sort();
}

export function extractOwnedPaths(source) {
  const found = new Set();
  let m;
  PATH_LITERAL_RE.lastIndex = 0;
  while ((m = PATH_LITERAL_RE.exec(source))) {
    // Strip the surrounding quote chars the regex captured as literal text.
    const raw = m[0].slice(1, -1);
    if (raw.length < 4) continue; // "apps"/"db/" alone is too broad to be a real hint
    found.add(raw);
  }
  return [...found].sort();
}

/** Compute a stable hash over the guard-file set's names + contents, so a consumer can detect
 * "the map on disk no longer matches scripts/" without re-scanning every file itself. */
export function computeScriptsDirHash(dir = SCRIPTS_DIR) {
  const hash = crypto.createHash("sha256");
  for (const f of listGuardFiles(dir)) {
    hash.update(f);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(dir, f), "utf8"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function buildGateStepMap(dir = SCRIPTS_DIR) {
  const files = listGuardFiles(dir);
  const entries = {};
  for (const f of files) {
    const source = fs.readFileSync(path.join(dir, f), "utf8");
    const ownedPaths = extractOwnedPaths(source);
    entries[f] = ownedPaths.length > 0 ? { ownedPaths, alwaysRun: false } : { ownedPaths: [], alwaysRun: true };
  }
  return {
    generatedAt: new Date().toISOString(),
    scriptsDirHash: computeScriptsDirHash(dir),
    guardCount: files.length,
    entries,
  };
}

export function writeGateStepMap(map = buildGateStepMap(), mapPath = GATE_STEP_MAP_PATH) {
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  return map;
}

/** Load the on-disk map; regenerate (and rewrite) if missing or stale against the current
 * scripts/ dir. Always returns a map that is fresh for THIS run -- never trusts a stale one.
 * `mapPath` defaults relative to `dir` (NOT the hardcoded real-repo constant) -- a caller scanning
 * a different scripts/ dir (a test fixture, a worktree) must never read or write this project's
 * own cached map. */
export function ensureFreshGateStepMap({ dir = SCRIPTS_DIR, mapPath = path.join(dir, ".gate-step-map.json") } = {}) {
  const currentHash = computeScriptsDirHash(dir);
  let onDisk = null;
  try {
    onDisk = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  } catch {
    onDisk = null;
  }
  if (onDisk && onDisk.scriptsDirHash === currentHash) {
    return { map: onDisk, regenerated: false };
  }
  const map = writeGateStepMap(buildGateStepMap(dir), mapPath);
  return { map, regenerated: true };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    const currentHash = computeScriptsDirHash();
    let onDisk = null;
    try {
      onDisk = JSON.parse(fs.readFileSync(GATE_STEP_MAP_PATH, "utf8"));
    } catch {
      /* falls through to the mismatch report below */
    }
    if (onDisk && onDisk.scriptsDirHash === currentHash) {
      console.log(`generate-gate-step-map --check OK — ${onDisk.guardCount} guards, hash matches`);
      return;
    }
    console.error(
      `generate-gate-step-map --check FAILED — .gate-step-map.json is stale or missing. ` +
        `Run: node scripts/generate-gate-step-map.mjs`
    );
    process.exit(1);
  }
  const map = writeGateStepMap();
  console.log(
    `generate-gate-step-map: wrote ${GATE_STEP_MAP_PATH} — ${map.guardCount} guards, ` +
      `${Object.values(map.entries).filter((e) => e.alwaysRun).length} always-run (no extractable path)`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
