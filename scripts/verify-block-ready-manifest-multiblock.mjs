#!/usr/bin/env node
// ============================================================================
// GUARD: a branch registering MULTIPLE .block-ready manifests must resolve to
// aggregate mode, never throw.
//
// WHY THIS EXISTS (2026-07-20, PR #2905)
// ----------------------------------------------------------------------------
// resolveBlockReadyManifest() threw `ambiguous exact branch` whenever more than
// one .block-ready manifest named the same branch — unconditionally, even for
// callers passing allowAggregate:true. That was inconsistent with the
// zero-match path, which has always degraded to aggregate for those callers.
//
// The blast radius was total, not local: verify-pre-commit.mjs calls this at
// IMPORT time (line 13) with allowAggregate:true, before a single guard is
// constructed. So registering 6 blocks on one branch made the resolver throw
// and killed the ENTIRE ~250-guard verify suite — while emitting an error that
// never mentions guards. Same failure class as the known BLOCK_ID import-time
// crash: a manifest-resolution failure that presents as total verification
// loss, which is the most expensive kind of red because it looks unrelated.
//
// Aggregate mode already means "run every verify-step", which is exactly the
// correct semantics for a branch carrying several blocks.
//
// WHAT THIS GUARD LOCKS
//   1. N manifests on one branch + allowAggregate  -> resolution "aggregate", no throw
//   2. N manifests on one branch, no allowAggregate -> still throws (opt-in only)
//   3. exactly 1 manifest on a branch               -> resolution "exact-branch"
//   4. BLOCK_ID set on a multi-block branch         -> selects that single manifest
//
// (2) and (4) are the anti-weakening cases: this fix must not make the resolver
// permissive for callers that never opted in, and must not let aggregate mode
// swallow an explicit BLOCK_ID.
//
// Self-test:  node scripts/verify-block-ready-manifest-multiblock.mjs --selftest
// LINKAGE: N/A (build/verification infra). Additive only.
// ============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveBlockReadyManifest } from "./block-ready-agent-manifest.mjs";

const BRANCH = "feat/multi-block-fixture";

/** Build a throwaway worktree containing .block-ready/<n>.json manifests all on BRANCH. */
function makeFixture(ids, branch = BRANCH) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "block-ready-fixture-"));
  fs.mkdirSync(path.join(root, ".block-ready"));
  for (const id of ids) {
    fs.writeFileSync(
      path.join(root, ".block-ready", `${id}.json`),
      JSON.stringify({ block_id: id, branch }, null, 2)
    );
  }
  return root;
}

function cleanup(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function run() {
  const results = [];

  // 1. multi-block + allowAggregate -> aggregate, no throw (the actual fix)
  {
    const root = makeFixture(["BLOCK-A", "BLOCK-B", "BLOCK-C"]);
    try {
      const r = resolveBlockReadyManifest({
        worktreePath: root,
        branch: BRANCH,
        env: {},
        allowAggregate: true,
      });
      results.push([
        "3 blocks on one branch + allowAggregate -> aggregate",
        r.resolution === "aggregate" && r.manifest === null,
      ]);
      results.push([
        "aggregate reason names the block count",
        typeof r.reason === "string" && r.reason.includes("3"),
      ]);
    } catch (error) {
      results.push([`3 blocks + allowAggregate must not throw (got: ${error.message})`, false]);
    } finally {
      cleanup(root);
    }
  }

  // 2. multi-block WITHOUT allowAggregate -> still throws (no silent weakening)
  {
    const root = makeFixture(["BLOCK-A", "BLOCK-B"]);
    let threw = false;
    try {
      resolveBlockReadyManifest({ worktreePath: root, branch: BRANCH, env: {} });
    } catch {
      threw = true;
    } finally {
      cleanup(root);
    }
    results.push(["multi-block without allowAggregate still throws", threw === true]);
  }

  // 3. single block -> exact-branch (unchanged behavior)
  {
    const root = makeFixture(["BLOCK-ONLY"]);
    try {
      const r = resolveBlockReadyManifest({
        worktreePath: root,
        branch: BRANCH,
        env: {},
        allowAggregate: true,
      });
      results.push([
        "single block -> exact-branch with a manifest",
        r.resolution === "exact-branch" && typeof r.manifest === "string",
      ]);
    } catch (error) {
      results.push([`single block must resolve (got: ${error.message})`, false]);
    } finally {
      cleanup(root);
    }
  }

  // 4. BLOCK_ID on a multi-block branch still selects exactly that manifest
  {
    const root = makeFixture(["BLOCK-A", "BLOCK-B", "BLOCK-C"]);
    try {
      const r = resolveBlockReadyManifest({
        worktreePath: root,
        branch: BRANCH,
        env: { BLOCK_ID: "BLOCK-B" },
        allowAggregate: true,
      });
      results.push([
        "BLOCK_ID wins over aggregate on a multi-block branch",
        r.resolution === "block-id" && String(r.manifest).includes("BLOCK-B"),
      ]);
    } catch (error) {
      results.push([`BLOCK_ID selection must work (got: ${error.message})`, false]);
    } finally {
      cleanup(root);
    }
  }

  return results;
}

const results = run();
let failed = 0;
for (const [label, ok] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(
    `\nverify-block-ready-manifest-multiblock: ${failed} check(s) failed. ` +
      `A multi-block branch must resolve to aggregate, or verify:pre-commit dies at import ` +
      `and every guard in the suite is silently skipped.`
  );
  process.exit(1);
}

console.log(`\nverify-block-ready-manifest-multiblock: all ${results.length} checks passed.`);
