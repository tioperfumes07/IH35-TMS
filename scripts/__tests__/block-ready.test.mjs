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
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no real scripts\/verify-\*\.mjs guard/i);
});

test("guard_required=true rejects a no-op verify-step without a real guard", () => {
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [{ status: "A", path: step }],
    changedFileSources: new Map([[step, 'export default { name: "noop", run() {} };']]),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no real scripts\/verify-\*\.mjs guard/i);
});

test("guard_required=true rejects an unwired standalone guard", () => {
  const guard = "scripts/verify-example.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [{ status: "A", path: guard }],
    changedFileSources: new Map([[guard, 'console.log("real guard");']]),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no added auto-discovered verify-step directly invokes/i);
});

test("guard_required=true rejects an empty guard even when a step invokes its path", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, "// no guard implementation"],
      [
        step,
        'export default { run(ctx) { return ctx.run("node", ["scripts/verify-example.mjs"]); } };',
      ],
    ]),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no real scripts\/verify-\*\.mjs guard/i);
});

test("guard_required=true rejects a real guard paired with an unrelated step", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-other.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, 'console.log("real guard");'],
      [
        step,
        'export default { name: "other", run(ctx) { return ctx.run("node", ["scripts/verify-other.mjs"]); } };',
      ],
    ]),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.wiredGuardFiles, []);
});

test("guard_required=true accepts a real guard plus a directly invoking formatted step", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, 'console.log("real guard");'],
      [
        step,
        `export default {
          name: "example",
          run ( ctx ) {
            return ctx
              .run(
                'node',
                [ 'scripts/verify-example.mjs', '--selftest' ]
              );
          }
        };`,
      ],
    ]),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.wiredGuardFiles, [guard]);
});

test("guard_required=true rejects aliases, comments, and near-match guard paths", () => {
  const guard = "scripts/verify-example.mjs";
  const cases = [
    'const target = "scripts/verify-example.mjs"; export default { run(ctx) { return ctx.run("node", [target]); } };',
    'export default { run(ctx) { const run = ctx.run; return run("node", ["scripts/verify-example.mjs"]); } };',
    '// ctx.run("node", ["scripts/verify-example.mjs"])\nexport default { run() {} };',
    'export default { run(ctx) { return ctx.run("node", ["scripts/verify-example.mjs.backup"]); } };',
  ];

  for (const [index, source] of cases.entries()) {
    const step = `scripts/verify-steps/99${index}-verify-example.mjs`;
    const result = evaluateGuardRequirement({
      guardRequired: true,
      changedNameStatus: [
        { status: "A", path: guard },
        { status: "A", path: step },
      ],
      changedFileSources: new Map([
        [guard, 'console.log("real guard");'],
        [step, source],
      ]),
    });
    assert.equal(result.ok, false, `case ${index} must not count as wiring`);
  }
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
