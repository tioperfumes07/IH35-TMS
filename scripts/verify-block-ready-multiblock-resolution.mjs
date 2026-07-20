#!/usr/bin/env node
// ============================================================================
// verify-block-ready-multiblock-resolution.mjs — STATIC CI GUARD (FUNCTIONAL)
// ----------------------------------------------------------------------------
// Pins the 2026-07-20 fix to resolveBlockReadyManifest: a branch that registers
// N blocks is a VALID SET, not an ambiguity.
//
// THE BUG THIS PINS:
//   `allowAggregate` was honored on the !branch and branchMatches.length === 0
//   paths but NOT on length > 1 — so a caller that had explicitly opted into
//   aggregate tolerance (verify-pre-commit passes allowAggregate: true) still
//   got a hard throw:
//     Error: ambiguous exact branch "feat/..." matches: <6 manifests>
//   One logical change spanning several blocks was therefore unlandable except
//   by splitting it into N branches — which hides the trap for the next
//   multi-block registration instead of fixing it.
//
// This guard is FUNCTIONAL, not a string scan: it builds real temp worktrees
// and calls the real resolver. A string-matching guard would have passed on a
// resolver that returned the right shape for the wrong reason.
//
// Cases covered (as specified by the owner):
//   1-block branch      -> resolution "exact-branch", that one manifest
//   6-block branch      -> resolution "aggregate", manifest null, all 6 listed
//   BLOCK_ID            -> still selects a SINGLE manifest on a 6-block branch
//   allowAggregate false-> still THROWS (fail-closed preserved, not softened)
//
// Self-test:  node scripts/verify-block-ready-multiblock-resolution.mjs --selftest
//   (the run and the self-test are the same assertions — this guard has no
//    repo-state dependency, so it cannot silently SKIP.)
// LINKAGE: N/A (build/CI tooling). Additive only. Read-only w.r.t. the repo.
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlockReadyManifest } from "./block-ready-agent-manifest.mjs";

const BRANCH = "feat/multi-block-fixture";

function makeWorktree(blocks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blockready-fixture-"));
  fs.mkdirSync(path.join(dir, ".block-ready"));
  for (const id of blocks) {
    fs.writeFileSync(
      path.join(dir, ".block-ready", `${id}.json`),
      JSON.stringify({ block_id: id, branch: BRANCH, status: "BUILD" }, null, 2)
    );
  }
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** Resolve against a fixture with an explicit branch so no git context is needed. */
function resolve(dir, extra = {}) {
  return resolveBlockReadyManifest({ worktreePath: dir, branch: BRANCH, env: {}, ...extra });
}

function runChecks() {
  const failures = [];
  const check = (name, fn) => {
    try {
      const ok = fn();
      if (!ok) failures.push(name);
    } catch (e) {
      failures.push(`${name} (threw: ${e.message})`);
    }
  };

  // ---- CASE 1: single-block branch still resolves to that exact manifest ----
  {
    const dir = makeWorktree(["SOLO-BLOCK"]);
    check("1-block branch -> resolution 'exact-branch'", () => {
      const r = resolve(dir, { allowAggregate: true });
      return r.resolution === "exact-branch" && String(r.manifest).endsWith("SOLO-BLOCK.json");
    });
    check("1-block branch resolves the same WITHOUT allowAggregate", () => {
      const r = resolve(dir);
      return r.resolution === "exact-branch" && String(r.manifest).endsWith("SOLO-BLOCK.json");
    });
    cleanup(dir);
  }

  // ---- CASE 2: six-block branch aggregates instead of throwing ----
  const SIX = [
    "BLOCK-02-DRIVER-ESCROW-DESIGN",
    "block-22-driver-settlement-engine",
    "CHAIN-04-bill-payment-tieout",
    "CONN-1-plaid-reconcile-commit",
    "CONN-3-relay-internal-bank",
    "STMT-2-opening-balances",
  ];
  {
    const dir = makeWorktree(SIX);
    check("6-block branch -> resolution 'aggregate'", () => {
      const r = resolve(dir, { allowAggregate: true });
      return r.resolution === "aggregate";
    });
    check("6-block aggregate -> manifest is null (consumers run ALL steps)", () => {
      const r = resolve(dir, { allowAggregate: true });
      return r.manifest === null;
    });
    check("6-block aggregate -> lists all 6 manifests", () => {
      const r = resolve(dir, { allowAggregate: true });
      return Array.isArray(r.manifests) && r.manifests.length === 6;
    });
    check("6-block aggregate -> reason names the branch and the count", () => {
      const r = resolve(dir, { allowAggregate: true });
      return typeof r.reason === "string" && r.reason.includes(BRANCH) && r.reason.includes("6");
    });

    // ---- CASE 3: BLOCK_ID still selects exactly one manifest on that branch ----
    check("BLOCK_ID on a 6-block branch -> single manifest, resolution 'block-id'", () => {
      const r = resolve(dir, { allowAggregate: true, blockId: "CONN-1-plaid-reconcile-commit" });
      return r.resolution === "block-id" && String(r.manifest).endsWith("CONN-1-plaid-reconcile-commit.json");
    });
    check("BLOCK_ID via env is honored the same way", () => {
      const r = resolveBlockReadyManifest({
        worktreePath: dir,
        branch: BRANCH,
        env: { BLOCK_ID: "STMT-2-opening-balances" },
        allowAggregate: true,
      });
      return r.resolution === "block-id" && String(r.manifest).endsWith("STMT-2-opening-balances.json");
    });
    check("unknown BLOCK_ID still fails closed", () => {
      try { resolve(dir, { allowAggregate: true, blockId: "NO-SUCH-BLOCK" }); return false; }
      catch (e) { return /requires exact manifest/.test(e.message); }
    });

    // ---- CASE 4: fail-closed preserved when the caller did NOT opt in ----
    check("6-block branch WITHOUT allowAggregate still THROWS", () => {
      try { resolve(dir); return false; }
      catch (e) { return /ambiguous exact branch/.test(e.message); }
    });
    check("allowAggregate:false is treated as not opting in (strict !== true)", () => {
      try { resolve(dir, { allowAggregate: false }); return false; }
      catch (e) { return /ambiguous exact branch/.test(e.message); }
    });
    check("truthy-but-not-true allowAggregate does NOT opt in", () => {
      try { resolve(dir, { allowAggregate: "yes" }); return false; }
      catch (e) { return /ambiguous exact branch/.test(e.message); }
    });
    cleanup(dir);
  }

  // ---- CASE 5: the pre-existing aggregate paths are untouched ----
  {
    const dir = makeWorktree(["OTHER-BLOCK"]);
    check("branch with NO matching manifest still aggregates (unchanged)", () => {
      const r = resolveBlockReadyManifest({
        worktreePath: dir, branch: "feat/unrelated", env: {}, allowAggregate: true,
      });
      return r.resolution === "aggregate" && r.manifest === null;
    });
    check("no branch context still aggregates (unchanged)", () => {
      const r = resolveBlockReadyManifest({
        worktreePath: dir, branch: "", env: {}, allowAggregate: true,
      });
      return r.resolution === "aggregate" && r.manifest === null;
    });
    cleanup(dir);
  }

  return failures;
}

const failures = runChecks();
const TOTAL = 14;
if (failures.length) {
  console.error("verify:block-ready-multiblock-resolution FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  console.error(
    "\n  A branch registering N blocks is a VALID SET, not an ambiguity. Callers that opt into\n" +
      "  allowAggregate must get resolution:'aggregate' (manifest null -> all verify-steps run),\n" +
      "  while callers that do NOT opt in stay fail-closed on the ambiguous-branch throw."
  );
  process.exit(1);
}
console.log(`verify:block-ready-multiblock-resolution — PASS (${TOTAL} checks)`);

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMainModule) { /* imported: assertions already ran above */ }
