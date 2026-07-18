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
  executeGuardContract,
  matchesAnyAllowedFile,
  parseManifest,
  readUtf8FileFromStableHandle,
  readVerifyMeta,
  resolvePathInsideRoot,
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
    import { runExecutableGuard } from "./guard-executable-contract.mjs";

    function checkTarget(source) {
      const failures = [];
      if (source.includes("FORBIDDEN")) failures.push("forbidden marker");
      return failures;
    }

    function loadRepositoryFixture() {
      return "allowed repository input";
    }

    const goodFixture = "allowed";
    const badFixture = "FORBIDDEN";
    runExecutableGuard({
      label: "fixture-guard",
      checker: checkTarget,
      loadRepositoryFixture,
      goodFixture,
      badFixture,
    });
  `;
}

function invokingStep(guard = "scripts/verify-example.mjs") {
  return `export default {
    name: "example",
    run(ctx) {
      ctx.run("node", ["${guard}"]);
      return ctx.run("node", ["${guard}", "--selftest"]);
    }
  };`;
}

function validContractResults(guard) {
  return new Map([[guard, { ok: true, reason: null }]]);
}

function executeFixtureGuard(source) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "block-ready-contract-"));
  try {
    const scriptsDir = path.join(tempRoot, "scripts");
    fs.mkdirSync(scriptsDir);
    fs.copyFileSync(
      path.join(REPO_ROOT, "scripts/guard-executable-contract.mjs"),
      path.join(scriptsDir, "guard-executable-contract.mjs")
    );
    fs.writeFileSync(path.join(scriptsDir, "verify-example.mjs"), source, "utf8");
    return executeGuardContract("scripts/verify-example.mjs", tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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
    guardContractResults: validContractResults(guard),
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
    guardContractResults: validContractResults(guard),
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
            ctx
              .run(
                'node',
                [ 'scripts/verify-example.mjs' ]
              );
            return ctx
              .run(
                'node',
                [ 'scripts/verify-example.mjs', '--selftest' ]
              );
          }
        };`,
      ],
    ]),
    guardContractResults: validContractResults(guard),
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
      guardContractResults: validContractResults(guard),
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
    guardContractResults: validContractResults(guard),
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

test("guard_required=true rejects discarded repository reads and ignored checker input", () => {
  const guard = "scripts/verify-example.mjs";
  const step = "scripts/verify-steps/999-verify-example.mjs";
  const reproducers = [
    `
      import fs from "node:fs";
      import { runExecutableGuard } from "./guard-executable-contract.mjs";
      function checkTarget(_input) { return []; }
      function loadRepositoryFixture() {
        fs.readFileSync("target.txt", "utf8");
        return "constant";
      }
      const goodFixture = "GOOD";
      const badFixture = "BAD";
      runExecutableGuard({
        label: "discarded-read",
        checker: checkTarget,
        loadRepositoryFixture,
        goodFixture,
        badFixture,
      });
    `,
    `
      import { runExecutableGuard } from "./guard-executable-contract.mjs";
      function checkTarget(_input) { return false; }
      function loadRepositoryFixture() { return "repository"; }
      const goodFixture = "GOOD";
      const badFixture = "BAD";
      runExecutableGuard({
        label: "always-false",
        checker: checkTarget,
        loadRepositoryFixture,
        goodFixture,
        badFixture,
      });
    `,
    `
      import { runExecutableGuard } from "./guard-executable-contract.mjs";
      function checkTarget(input) {
        void input;
        return [];
      }
      function loadRepositoryFixture() { return "repository"; }
      const goodFixture = { marker: "GOOD" };
      const badFixture = { marker: "BAD" };
      runExecutableGuard({
        label: "ignored-selftest-input",
        checker: checkTarget,
        loadRepositoryFixture,
        goodFixture,
        badFixture,
      });
    `,
  ];

  for (const source of reproducers) {
    const execution = executeFixtureGuard(source);
    assert.equal(execution.ok, false);
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
      guardContractResults: new Map([[guard, execution]]),
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /executable|selftest|checker/i);
  }
});

test("executable guard contract rejects colluding no-op fixtures and hidden state", () => {
  const sameFixtures = `
    import { runExecutableGuard } from "./guard-executable-contract.mjs";
    function checkTarget(input) { return input.bad ? ["bad"] : []; }
    function loadRepositoryFixture() { return {}; }
    const goodFixture = {};
    const badFixture = {};
    runExecutableGuard({
      label: "same-fixtures",
      checker: checkTarget,
      loadRepositoryFixture,
      goodFixture,
      badFixture,
    });
  `;
  const callOrder = `
    import { runExecutableGuard } from "./guard-executable-contract.mjs";
    let calls = 0;
    function checkTarget(_input) {
      calls += 1;
      return calls % 2 === 1 ? ["manufactured"] : [];
    }
    function loadRepositoryFixture() { return {}; }
    const goodFixture = { kind: "good" };
    const badFixture = { kind: "bad" };
    runExecutableGuard({
      label: "hidden-state",
      checker: checkTarget,
      loadRepositoryFixture,
      goodFixture,
      badFixture,
    });
  `;
  assert.equal(executeFixtureGuard(sameFixtures).ok, false);
  assert.equal(executeFixtureGuard(callOrder).ok, false);
});

test("manifest, guard, and step paths reject absolute and parent escapes", () => {
  assert.throws(() => resolvePathInsideRoot("../escape.mjs"), /escapes root/);
  assert.throws(() => resolvePathInsideRoot("/tmp/escape.mjs"), /must be relative/);
  assert.throws(() => parseManifest("../escape.json"), /escapes root/);

  const unsafeManifest = {
    block_id: "unsafe",
    phase: "test",
    task: "test",
    allowed_files: ["../escape.mjs", "/tmp/absolute.mjs"],
    extra_gates: [],
    runtime_path: "src",
    db_required: false,
    guard_required: true,
  };
  assert.match(validateManifest(unsafeManifest).join("; "), /unsafe path/);

  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [
      { status: "A", path: "../scripts/verify-escape.mjs" },
      { status: "A", path: "/tmp/scripts/verify-steps/999-escape.mjs" },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /paths are unsafe/);
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
    guardContractResults: validContractResults(guard),
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
    guardContractResults: new Map([[guard, executeGuardContract(guard, REPO_ROOT)]]),
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

function makeManifestRepo(entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "block-ready-manifest-"));
  const dir = path.join(root, ".block-ready");
  fs.mkdirSync(dir);
  for (const [filename, manifest] of Object.entries(entries)) {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(manifest), "utf8");
  }
  return root;
}

test("resolveBlockReadyManifest gives explicit BLOCK_ID deterministic priority", () => {
  const root = makeManifestRepo({
    "RIGHT.json": { block_id: "RIGHT", branch: "fix/shared" },
    "OTHER.json": { block_id: "OTHER", branch: "fix/shared" },
  });
  const resolved = resolveBlockReadyManifest({
    worktreePath: root,
    blockId: "RIGHT",
    branch: "fix/shared",
  });
  assert.equal(resolved.manifest, ".block-ready/RIGHT.json");
  assert.equal(resolved.resolution, "block-id");
});

test("resolveBlockReadyManifest rejects wrong explicit BLOCK_ID without fallback", () => {
  const root = makeManifestRepo({
    "RIGHT.json": { block_id: "WRONG-IN-FILE", branch: "fix/right" },
  });
  assert.throws(
    () =>
      resolveBlockReadyManifest({
        worktreePath: root,
        blockId: "RIGHT",
        branch: "fix/right",
      }),
    /does not match manifest block id/
  );
});

test("resolveBlockReadyManifest rejects ambiguous exact branch matches", () => {
  const root = makeManifestRepo({
    "ONE.json": { block_id: "ONE", branch: "fix/shared" },
    "TWO.json": { block_id: "TWO", branch: "fix/shared" },
  });
  assert.throws(
    () => resolveBlockReadyManifest({ worktreePath: root, branch: "fix/shared" }),
    /ambiguous exact branch/
  );
});

test("resolveBlockReadyManifest rejects absent exact branch without legacy fallback", () => {
  const root = makeManifestRepo({
    "OLD.json": { block_id: "OLD", branch: "fix/old" },
  });
  assert.throws(
    () => resolveBlockReadyManifest({ worktreePath: root, branch: "fix/new" }),
    /no \.block-ready manifest has exact branch/
  );
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
