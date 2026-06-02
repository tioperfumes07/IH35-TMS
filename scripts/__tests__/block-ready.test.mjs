import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

import {
  computeDbGatePlan,
  evaluateGuardRequirement,
  matchesAnyAllowedFile,
  parseArgs,
  parseManifest,
  readVerifyMeta,
  shouldSkipC5VerifyScript,
  validateManifest,
} from "../block-ready.mjs";
import { resolveBlockReadyManifest } from "../block-ready-agent-manifest.mjs";

test("valid manifest passes validation", () => {
  const manifest = {
    block_id: "MAGNET-4-FINAL",
    phase: "Refactor",
    task: "MAGNET-4",
    allowed_files: ["scripts/**"],
    extra_gates: ["verify:accounting-autoload-coverage"],
    runtime_path: "both",
    db_required: true,
    guard_required: true,
  };
  assert.deepEqual(validateManifest(manifest), []);
});

test("missing required field fails with field name", () => {
  const manifest = {
    phase: "Refactor",
    task: "MAGNET-4",
    allowed_files: [],
    extra_gates: [],
    runtime_path: "both",
    db_required: true,
    guard_required: true,
  };
  const errors = validateManifest(manifest);
  assert.ok(errors.some((err) => err.includes("block_id")));
});

test("invalid runtime_path enum fails", () => {
  const manifest = {
    block_id: "X",
    phase: "Tooling",
    task: "X",
    allowed_files: [],
    extra_gates: [],
    runtime_path: "invalid",
    db_required: false,
    guard_required: false,
  };
  const errors = validateManifest(manifest);
  assert.ok(errors.some((err) => err.includes("runtime_path")));
});

test("allowed-files glob accepts and rejects expected paths", () => {
  const patterns = ["scripts/**", "package.json"];
  assert.equal(matchesAnyAllowedFile("scripts/block-ready.mjs", patterns), true);
  assert.equal(matchesAnyAllowedFile("apps/backend/src/index.ts", patterns), false);
});

test("guard_required=true with no guard file in changeset fails", () => {
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [{ status: "M", path: "package.json" }],
    ciDiffText: "+      - name: verify something",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no new verify guard/i);
});

test("db_required=true skips ci:boot-api-smoke", () => {
  const plan = computeDbGatePlan({
    runtime_path: "both",
    db_required: true,
    extra_gates: ["smoke:accounting"],
  });
  assert.equal(plan.deferToCi, true);
  assert.equal(plan.runBootSmoke, false);
  assert.deepEqual(plan.smokeScripts, []);
});

test("parseManifest reads existing JSON file", () => {
  const parsed = parseManifest("docs/block-ready-examples/MAGNET-4-FINAL.json");
  assert.equal(parsed.manifest.block_id, "MAGNET-4-FINAL");
});

test("resolveBlockReadyManifest uses AGENT env override", () => {
  const resolved = resolveBlockReadyManifest({
    agentEnv: "agent2",
    worktreePath: "/tmp/IH35-TMS-agent1",
  });
  assert.equal(resolved.agent, "2");
  assert.equal(resolved.manifest, ".block-ready.agent2.json");
});

test("resolveBlockReadyManifest infers AGENT from worktree path", () => {
  const resolved = resolveBlockReadyManifest({
    worktreePath: "/tmp/IH35-TMS-agent2-acct",
  });
  assert.equal(resolved.agent, "2");
  assert.equal(resolved.manifest, ".block-ready.agent2.json");
});

test("parseArgs defaults to resolved manifest", () => {
  const args = parseArgs([], { agentEnv: "agent1", worktreePath: "/tmp/IH35-TMS-agent1" });
  assert.equal(args.manifest, ".block-ready.agent1.json");
});

test("readVerifyMeta returns db_gated and c5_skip_after_c4 lists", () => {
  const meta = readVerifyMeta(REPO_ROOT);
  assert.ok(Array.isArray(meta.db_gated_verify_scripts));
  assert.ok(meta.db_gated_verify_scripts.includes("verify:pre-commit"));
  assert.ok(Array.isArray(meta.block_ready_c5_skip_after_c4));
  assert.ok(meta.block_ready_c5_skip_after_c4.includes("verify:arch-design"));
});

test("C5 honors block_ready_c5_skip_after_c4 for verify:arch-design", () => {
  const meta = readVerifyMeta(REPO_ROOT);
  assert.equal(shouldSkipC5VerifyScript("verify:arch-design", meta), true);
});

test("C5 still runs verify scripts not in skip-after-c4 set", () => {
  const meta = readVerifyMeta(REPO_ROOT);
  assert.equal(shouldSkipC5VerifyScript("verify:nav-integrity", meta), false);
  assert.equal(shouldSkipC5VerifyScript("verify:fixture-other", meta), false);
});
