import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
  readUtf8FileFromStableHandle,
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

test("stable file reads use one descriptor and fail closed for unsafe targets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-ready-stable-read-"));
  try {
    const target = path.join(tempDir, "guard.mjs");
    fs.writeFileSync(target, "export const value = 1;\n", "utf8");
    assert.deepEqual(readUtf8FileFromStableHandle(target), {
      ok: true,
      source: "export const value = 1;\n",
    });

    const missing = readUtf8FileFromStableHandle(path.join(tempDir, "missing.mjs"));
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "ENOENT");

    const directory = readUtf8FileFromStableHandle(tempDir);
    assert.equal(directory.ok, false);
    assert.equal(directory.code, "NOT_REGULAR_FILE");

    const symlink = path.join(tempDir, "guard-link.mjs");
    fs.symlinkSync(target, symlink);
    const linked = readUtf8FileFromStableHandle(symlink);
    assert.equal(linked.ok, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("block-ready guard reads contain no exists/access-then-read TOCTOU pattern", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, "scripts/block-ready.mjs"), "utf8");
  assert.doesNotMatch(
    source,
    /(?:existsSync|accessSync)\(absolutePath\)[\s\S]{0,300}readFileSync\(absolutePath/
  );
  assert.match(source, /openSync\(filePath,[\s\S]{0,300}fstatSync\(fileDescriptor\)/);
  assert.match(source, /readFileSync\(fileDescriptor,\s*"utf8"\)/);
});

function realGuardSource() {
  return `
    import fs from "node:fs";
    import path from "node:path";

    function checkTarget(source) {
      const failures = [];
      if (source.includes("FORBIDDEN")) failures.push("forbidden marker");
      return failures;
    }

    function runChecks() {
      return checkTarget(fs.readFileSync(path.join(process.cwd(), "target.txt"), "utf8"));
    }

    function selftest() {
      const planted = "allowed".replace("allowed", "FORBIDDEN");
      if (checkTarget(planted).length === 0) process.exit(1);
    }

    if (process.argv.includes("--selftest")) {
      selftest();
    } else {
      const failures = runChecks();
      if (failures.length > 0) process.exit(1);
    }
  `;
}

function invokingStep(guard = "scripts/verify-example.mjs") {
  return `export default {
    name: "example",
    run(ctx) {
      return ctx.run("node", ["${guard}"]);
    }
  };`;
}

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
    changedFileSources: new Map([[guard, realGuardSource()]]),
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
      [step, invokingStep(guard)],
    ]),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /guard contract failed/i);
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
      [guard, realGuardSource()],
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
      [guard, realGuardSource()],
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
        [guard, realGuardSource()],
        [step, source],
      ]),
    });
    assert.equal(result.ok, false, `case ${index} must not count as wiring`);
  }
});

test("guard_required=true rejects reviewer inert-guard reproducers", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const inertSources = [
    "const version = 1;",
    "export default {};",
    '"use strict";',
    'console.log("PASS");',
    "function noop() { return; }\nnoop();",
  ];

  for (const [index, source] of inertSources.entries()) {
    const result = evaluateGuardRequirement({
      guardRequired: true,
      changedNameStatus: [
        { status: "A", path: guard },
        { status: "A", path: step },
      ],
      changedFileSources: new Map([
        [guard, source],
        [step, invokingStep(guard)],
      ]),
    });
    assert.equal(result.ok, false, `inert reproducer ${index} must fail`);
    assert.match(result.reason, /guard contract failed/i);
  }
});

test("guard_required=true rejects malformed guard and malformed verify-step syntax", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const malformedGuard = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, "function broken( {"],
      [step, invokingStep(guard)],
    ]),
  });
  assert.equal(malformedGuard.ok, false);
  assert.match(malformedGuard.reason, /parse diagnostics/i);

  const malformedStep = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, realGuardSource()],
      [step, 'export default { run(ctx) { ctx.run("node", ["scripts/verify-example.mjs"] }'],
    ]),
  });
  assert.equal(malformedStep.ok, false);
  assert.match(malformedStep.reason, /verify-step parse failed/i);
});

test("guard_required=true rejects dead failure paths and fake selftest strings", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const deadExit = `
    import fs from "node:fs";
    function inspect() { return fs.readFileSync("target.txt", "utf8"); }
    function neverCalled() { if (false) process.exit(1); }
    function selftest() {
      const planted = "ok".replace("ok", "bad");
      if (planted.length === 0) process.exit(1);
    }
    if (process.argv.includes("--selftest")) selftest();
    else inspect();
  `;
  const fakeSelftest = `
    import fs from "node:fs";
    const marker = 'process.argv.includes("--selftest")';
    // process.argv.includes("--selftest")
    const source = fs.readFileSync("target.txt", "utf8");
    if (source.includes("bad")) process.exit(1);
  `;
  const unrelatedSelftest = `
    import fs from "node:fs";
    function actualCheck(source) { return source.includes("bad") ? ["bad"] : []; }
    function fakeCheck(source) { return source.includes("planted") ? ["fake"] : []; }
    function runChecks() { return actualCheck(fs.readFileSync("target.txt", "utf8")); }
    function selftest() {
      const planted = "ok".replace("ok", "planted");
      if (fakeCheck(planted).length === 0) process.exit(1);
    }
    if (process.argv.includes("--selftest")) selftest();
    else {
      const failures = runChecks();
      if (failures.length > 0) process.exit(1);
    }
  `;
  for (const source of [deadExit, fakeSelftest, unrelatedSelftest]) {
    const result = evaluateGuardRequirement({
      guardRequired: true,
      changedNameStatus: [
        { status: "A", path: guard },
        { status: "A", path: step },
      ],
      changedFileSources: new Map([
        [guard, source],
        [step, invokingStep(guard)],
      ]),
    });
    assert.equal(result.ok, false);
  }
});

test("guard_required=true accepts a real planted-target guard fixture", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, realGuardSource()],
      [step, invokingStep(guard)],
    ]),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.wiredGuardFiles, [guard]);
});

test("guard_required=true accepts the repository XLSX guard and verify-step", () => {
  const guard = "scripts/verify-xlsx-cve-closeout.mjs";
  const step = "scripts/verify-steps/144-verify-xlsx-cve-closeout.mjs";
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: guard },
      { status: "A", path: step },
    ],
    changedFileSources: new Map([
      [guard, fs.readFileSync(path.join(REPO_ROOT, guard), "utf8")],
      [step, fs.readFileSync(path.join(REPO_ROOT, step), "utf8")],
    ]),
  });
  assert.equal(result.ok, true, result.reason);
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
