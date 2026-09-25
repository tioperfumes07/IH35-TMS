#!/usr/bin/env node
// GATE-SCOPE-02 — verifies money-pr-local-gate.mjs's LIVE_DOMAIN_GUARDS loop no longer treats
// every file under a DATA_WRITE_PATHS prefix (db/migrations/, scripts/ops/) as a real DB write
// just because of its path. Static structural check (mirrors verify-live-domain-guards-are-
// diff-scoped.mjs's own pattern from GATE-SCOPE-01) plus a direct unit-level proof against the
// shared detection function itself, using real scratch files — not just source-text matching.
//
// Pure static + tmpfile analysis: no DB, no ALLOW_OFFLINE_SKIP needed (never connects).
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text analysis of money-pr-local-gate.mjs plus scratch-tmpfile unit checks of dataWritePathFileActuallyWrites(); never connects to a database";

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataWritePathDiffActuallyWrites, dataWritePathFileActuallyWrites } from "./lib/data-write-path-detection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE_FILE = "scripts/money-pr-local-gate.mjs";

const fail = (m) => {
  console.error(`\nverify-data-write-path-detection-is-content-based: FAIL — ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`verify-data-write-path-detection-is-content-based: ${m}`);

// ---- 1. structural check: the gate file must actually call the shared, content-based function,
// not the old blunt "spread DATA_WRITE_PATHS straight into prefixes" pattern. ----
function checkGateFileStructure(source) {
  if (/const prefixes = \[\.\.\.DATA_WRITE_PATHS, \.\.\.domainPaths\]/.test(source)) {
    fail(
      `${GATE_FILE} still spreads DATA_WRITE_PATHS unconditionally into prefixes — the exact ` +
        `pre-fix blunt path match (GATE-SCOPE-02).`,
    );
  }
  if (!/dataWritePathFileActuallyWrites/.test(source)) {
    fail(`${GATE_FILE} never references dataWritePathFileActuallyWrites — the content-based check is not wired in.`);
  }
  if (!/dataWritePathDiffActuallyWrites/.test(source)) {
    fail(`${GATE_FILE} does not inspect added diff lines before activating all live-domain guards.`);
  }
  if (!/from ["']\.\/lib\/data-write-path-detection\.mjs["']/.test(source)) {
    fail(`${GATE_FILE} does not import from ./lib/data-write-path-detection.mjs — the shared implementation is not actually used.`);
  }
  // domain paths must remain unconditional — a real fuel/ or accounting/ touch still triggers
  // regardless of content, only the DATA_WRITE_PATHS branch gets the content gate.
  if (!/domainPaths\.some\(\(p\) => f\.startsWith\(p\)\)\) return true;/.test(source)) {
    fail(`${GATE_FILE} no longer triggers unconditionally on a domainPaths match — that would silently weaken real domain guards, not just fix the false-positive class.`);
  }
  const dataWriteBranch = source.indexOf("if (DATA_WRITE_PATHS.some((p) => f.startsWith(p)))");
  const domainBranch = source.indexOf("if (domainPaths.some((p) => f.startsWith(p))) return true;", dataWriteBranch);
  if (dataWriteBranch < 0 || domainBranch < 0 || dataWriteBranch > domainBranch) {
    fail(`${GATE_FILE} checks domainPaths before DATA_WRITE_PATHS, allowing a broad db/migrations/ or scripts/ops/ domain entry to bypass the diff-content gate.`);
  }
}

// ---- 2. direct unit proof against the shared function, with real scratch files ----
function checkDetectionFunctionBehavior() {
  const tmp = mkdtempSync(path.join(tmpdir(), "gate-scope-02-"));
  try {
    // (a) a real .sql migration file — always a write, unconditionally, regardless of content.
    const migDir = path.join(tmp, "db", "migrations");
    execSync(`mkdir -p "${migDir}"`);
    const sqlRel = "db/migrations/202699999999_scratch_selftest.sql";
    writeFileSync(path.join(tmp, sqlRel), "-- comment only, no DDL even mentioned\n");
    if (!dataWritePathFileActuallyWrites(sqlRel, tmp)) {
      fail("a real .sql file under db/migrations/ was NOT detected as a write — real migrations must always trigger.");
    }

    // (b) a non-.sql file under db/migrations/ (the exact CLAIMED-MIGRATION-NUMBERS.json class) —
    // no DB client import, must NOT trigger.
    const jsonRel = "db/migrations/CLAIMED-MIGRATION-NUMBERS-scratch.json";
    writeFileSync(path.join(tmp, jsonRel), JSON.stringify({ claimed: {} }));
    if (dataWritePathFileActuallyWrites(jsonRel, tmp)) {
      fail("a non-.sql claim-registry file under db/migrations/ WAS detected as a write — the named false-positive class is not fixed.");
    }

    // (c) a scripts/ops/ file that reads a static JSON and imports no DB client (the exact
    // settlement-truth-target.mjs class) — must NOT trigger.
    const opsDir = path.join(tmp, "scripts", "ops");
    execSync(`mkdir -p "${opsDir}"`);
    const readOnlyRel = "scripts/ops/scratch-read-only.mjs";
    writeFileSync(path.join(tmp, readOnlyRel), 'import { readFileSync } from "node:fs";\nconst data = JSON.parse(readFileSync("./x.json", "utf8"));\nconsole.log(data);\n');
    if (dataWritePathFileActuallyWrites(readOnlyRel, tmp)) {
      fail("a read-only scripts/ops/ file with no DB client import WAS detected as a write — the named false-positive class is not fixed.");
    }

    // (d) a scripts/ops/ file that DOES import a real DB client — must still trigger (proves the
    // fix narrows false positives without blinding the guard to a genuine writer).
    const writerRel = "scripts/ops/scratch-real-writer.mjs";
    writeFileSync(path.join(tmp, writerRel), 'import { Client } from "pg";\nconst c = new Client({ connectionString: process.env.DATABASE_URL });\nawait c.connect();\n');
    if (!dataWritePathFileActuallyWrites(writerRel, tmp)) {
      fail("a scripts/ops/ file that imports pg's Client and reads DATABASE_URL was NOT detected as a write — the content check itself is broken, not just narrowed.");
    }

    const authOnlyDiff = `diff --git a/${writerRel} b/${writerRel}\n+const authId = process.env.OWNER_AUTH_ID;\n+spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId]);\n`;
    if (dataWritePathDiffActuallyWrites(writerRel, tmp, authOnlyDiff)) {
      fail("an authorization-only edit to an existing writer was misclassified as a new financial write.");
    }

    const realWriteDiff = `diff --git a/${writerRel} b/${writerRel}\n+await client.query("UPDATE accounting.expenses SET memo = $1 WHERE id = $2", [memo, id]);\n`;
    if (!dataWritePathDiffActuallyWrites(writerRel, tmp, realWriteDiff)) {
      fail("a newly added financial UPDATE was not detected from the actual diff hunk.");
    }

    ok(`unit proof PASS — 6/6 (file class + authorization-only diff + real financial-write diff)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (!existsSync(path.join(ROOT, GATE_FILE))) fail(`${GATE_FILE} is missing.`);
checkGateFileStructure(readFileSync(path.join(ROOT, GATE_FILE), "utf8"));
checkDetectionFunctionBehavior();

ok("PASS — DATA_WRITE_PATHS matches are content-gated; real .sql migrations and genuine DB-client scripts.ops writers still trigger unconditionally/correctly; domain paths remain unconditional.");
