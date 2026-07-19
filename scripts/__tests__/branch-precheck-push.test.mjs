import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";
import {
  GATE_RESULT_CATEGORIES,
  detectLocalCapabilities,
  preflightStep,
  runPrecheckPush,
} from "../branch-precheck-push.mjs";
import { VLCI_ENV, createOwnerSession } from "../vlci-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-precheck-push.mjs");
const prePushHookPath = path.resolve(root, ".husky/pre-push");
const HOSTILE_NEON_URL =
  "postgresql://neondb_owner:BAD_PASSWORD_NOT_REAL@ep-hostile-stale.us-east-2.aws.neon.tech/neondb?sslmode=require";
const minimalSteps = JSON.stringify([
  { label: "build-backend", command: "npm run build:backend" },
  { label: "verify:fixture-pass", command: "npm run verify:fixture-pass" },
  { label: "block-ready", command: "npm run block-ready" },
]);
const validCapabilityPolicy = {
  equivalents: { database: "ci / build-typecheck" },
  serverRequiredContexts: new Set(["ci / build-typecheck"]),
  requiredContexts: new Set(["ci / build-typecheck"]),
  wiredContexts: new Set(["ci / build-typecheck"]),
};

function cleanChildEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.DATABASE_URL;
  delete env.DATABASE_DIRECT_URL;
  delete env[VLCI_ENV.DATABASE_URL];
  delete env[VLCI_ENV.TOKEN];
  delete env[VLCI_ENV.OWNED];
  delete env[VLCI_ENV.INHERIT];
  delete env[VLCI_ENV.ACTIVE];
  delete env[VLCI_ENV.LOCK_PATH];
  delete env[VLCI_ENV.PORT];
  delete env[VLCI_ENV.DATADIR];
  delete env[VLCI_ENV.TEMP_ROOT];
  delete env[VLCI_ENV.OWNER_PID];
  delete env[VLCI_ENV.STARTED_AT];
  return env;
}

function listenLocalTcp() {
  const server = net.createServer((socket) => socket.end());
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        url: `postgresql://verify:verify@127.0.0.1:${port}/ih35_verify`,
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

function stubVerifyStaticFallback(dir) {
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/verify-static.mjs"), "process.exit(0);\n", "utf8");
}

function runScript(args, env) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      BRANCH_PRECHECK_STEPS_JSON: minimalSteps,
      IH35_BRANCH_TOOLING_SKIP_FETCH: "1",
      ...env,
    },
  });
}

function writeMinimalPackage(dir) {
  fs.mkdirSync(path.join(dir, "apps/frontend"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "apps/frontend/tsconfig.json"),
    JSON.stringify({ compilerOptions: { noEmit: true }, include: [] }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: {
          "build:backend": "node -e \"process.exit(0)\"",
          "verify:fixture-pass": "node -e \"process.exit(0)\"",
          "block-ready": "node -e \"process.exit(0)\"",
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

function makeFeatureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-precheck-"));
  initFixtureRepo(dir);
  writeMinimalPackage(dir);
  fs.writeFileSync(path.join(dir, "README.md"), "main\n", "utf8");
  runGitOrThrow(["add", "README.md", "package.json", "apps/frontend/tsconfig.json"], { cwd: dir });
  runGitOrThrow(["commit", "-m", "main"], { cwd: dir });
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/precheck"], { cwd: dir });
  writeAndCommit(dir, "change.txt", "x\n", "feature");
  return dir;
}

test("refuses main branch", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /not on a feature branch/);
});

test("refuses when behind origin/main", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "ahead.txt", "ahead\n", "main moved");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /behind origin\/main/);
});

test("runs verify chain and prints ready", () => {
  const dir = makeFeatureRepo();
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /READY TO PUSH: feat\/precheck/);
});

test("surfaces failing verify step", () => {
  const dir = makeFeatureRepo();
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.scripts["verify:fixture-fail"] = "node -e \"process.exit(1)\"";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
  runGitOrThrow(["add", "package.json"], { cwd: dir });
  runGitOrThrow(["commit", "-m", "add failing fixture"], { cwd: dir });
  const failSteps = JSON.stringify([
    { label: "verify:fixture-fail", command: "npm run verify:fixture-fail" },
  ]);
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir, BRANCH_PRECHECK_STEPS_JSON: failSteps });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /category=test/);
  assert.match(run.stderr, /verify:fixture-fail/);
});

test("classifies dirty trees as a hard dirty failure", () => {
  const dir = makeFeatureRepo();
  fs.writeFileSync(path.join(dir, "dirty.txt"), "dirty\n", "utf8");
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.DIRTY);
});

test("classifies unresolved merge conflicts as a hard conflict failure", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "conflict.txt", "main\n", "main conflict");
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  writeAndCommit(dir, "conflict.txt", "feature\n", "feature conflict");
  const merge = spawnSync("git", ["merge", "main"], { cwd: dir, encoding: "utf8" });
  assert.notEqual(merge.status, 0);
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.CONFLICT);
});

test("skips a missing database only with a named server-required CI equivalent", () => {
  const result = preflightStep(
    {
      label: "block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
    { database: false },
    validCapabilityPolicy
  );
  assert.equal(result.action, "skip-capability");
  assert.equal(result.ciEquivalent, "ci / build-typecheck");
});

test("missing capability without a named CI equivalent is a hard capability failure", () => {
  const result = preflightStep(
    { label: "unsafe-step", requiredCapabilities: ["database"] },
    { database: false },
    validCapabilityPolicy
  );
  assert.equal(result.action, "fail");
  assert.match(result.reason, /without a named server-required CI equivalent/);
});

test("unknown or unwired capability equivalent is a hard capability failure", () => {
  const result = preflightStep(
    {
      label: "block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "unknown / check",
    },
    { database: false },
    validCapabilityPolicy
  );
  assert.equal(result.action, "fail");
  assert.match(result.reason, /declares "ci \/ build-typecheck", not requested "unknown \/ check"/);
});

test("stale Neon DATABASE_URL string alone is never a database capability", () => {
  const caps = detectLocalCapabilities(
    { DATABASE_URL: HOSTILE_NEON_URL, DATABASE_DIRECT_URL: HOSTILE_NEON_URL },
    { root, probeTcp: () => true }
  );
  assert.equal(caps.database, false);
  assert.equal(caps.databaseSource, null);
});

test("OWNED=1 without VLCI ownership proof is never a database capability", () => {
  const caps = detectLocalCapabilities(
    {
      [VLCI_ENV.OWNED]: "1",
      [VLCI_ENV.INHERIT]: "1",
      DATABASE_URL: "postgresql://v@127.0.0.1:55432/ih35_verify",
    },
    { root, probeTcp: () => true }
  );
  assert.equal(caps.database, false);
});

test("CI local-verify URL requires a validated TCP connection", () => {
  const dead = detectLocalCapabilities(
    { DATABASE_URL: "postgresql://verify:verify@127.0.0.1:54329/ih35_verify" },
    { root, probeTcp: () => false }
  );
  assert.equal(dead.database, false);

  const live = detectLocalCapabilities(
    { DATABASE_URL: "postgresql://verify:verify@127.0.0.1:54329/ih35_verify" },
    { root, probeTcp: () => true }
  );
  assert.equal(live.database, true);
  assert.equal(live.databaseSource, "local-ci-validated");
});

test("owned VLCI lifecycle env is a database capability without relying on URL-string presence", () => {
  const vlciRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-vlci-cap-"));
  const session = createOwnerSession(vlciRoot);
  const dataDir = path.join(session.tempRoot, "pgdata");
  fs.mkdirSync(dataDir, { mode: 0o700 });
  const url = "postgresql://v@127.0.0.1:55321/ih35_verify";
  session.updateBindings({ dataDir, port: 55321, database: "ih35_verify", url });
  try {
    const env = session.childEnv(cleanChildEnv());
    // Strip free-form URL; ownership proof alone must authorize.
    delete env.DATABASE_URL;
    delete env.DATABASE_DIRECT_URL;
    const caps = detectLocalCapabilities(env, { root: vlciRoot, probeTcp: () => false });
    assert.equal(caps.database, true);
    assert.equal(caps.databaseSource, "vlci-owned");
  } finally {
    session.release();
    fs.rmSync(vlciRoot, { recursive: true, force: true });
  }
});

function markerWriteCommand(markerPath) {
  const script = `require("fs").writeFileSync(${JSON.stringify(markerPath)}, "ran")`;
  return `node -e ${JSON.stringify(script)}`;
}

test("precheck with stale Neon env skips block-ready via server-required CI equivalent", () => {
  const dir = makeFeatureRepo();
  stubVerifyStaticFallback(dir);
  runGitOrThrow(["add", "scripts/verify-static.mjs"], { cwd: dir });
  runGitOrThrow(["commit", "-m", "stub verify-static fallback"], { cwd: dir });
  const marker = path.join(dir, "block-ready-ran.marker");
  const steps = [
    {
      label: "block-ready",
      command: markerWriteCommand(marker),
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
  ];
  const result = runPrecheckPush({
    root: dir,
    skipFetch: true,
    steps,
    capabilityPolicy: validCapabilityPolicy,
    env: cleanChildEnv({ DATABASE_URL: HOSTILE_NEON_URL }),
    probeTcp: () => true,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(fs.existsSync(marker), false, "block-ready must not run on stale Neon URL");
  assert.equal(result.skippedCapabilities?.length, 1);
  assert.equal(result.skippedCapabilities[0].ciEquivalent, "ci / build-typecheck");
});

test("explicitly inherited owned ephemeral DB context still runs DB gates", () => {
  const dir = makeFeatureRepo();
  const session = createOwnerSession(dir);
  const dataDir = path.join(session.tempRoot, "pgdata-run");
  fs.mkdirSync(dataDir, { mode: 0o700 });
  const url = "postgresql://v@127.0.0.1:55322/ih35_verify";
  session.updateBindings({ dataDir, port: 55322, database: "ih35_verify", url });
  const marker = path.join(dir, "block-ready-ran.marker");
  try {
    const steps = [
      {
        label: "block-ready",
        command: markerWriteCommand(marker),
        requiredCapabilities: ["database"],
        serverRequiredCiEquivalent: "ci / build-typecheck",
      },
    ];
    const result = runPrecheckPush({
      root: dir,
      skipFetch: true,
      steps,
      capabilityPolicy: validCapabilityPolicy,
      env: session.childEnv(cleanChildEnv()),
    });
    assert.equal(result.ok, true, result.reason);
    assert.equal(fs.readFileSync(marker, "utf8"), "ran");
    assert.equal(result.skippedCapabilities?.length ?? 0, 0);
  } finally {
    session.release();
  }
});

test("actual pre-push hook does not source hostile .env or override parent env", () => {
  const dir = makeFeatureRepo();
  const hostileUrl = HOSTILE_NEON_URL;
  fs.writeFileSync(
    path.join(dir, ".env"),
    `DATABASE_URL=${hostileUrl}\nDATABASE_DIRECT_URL=${hostileUrl}\n`,
    "utf8"
  );
  const hookBody = fs.readFileSync(prePushHookPath, "utf8");
  assert.doesNotMatch(hookBody, /(?:^|\n)\s*(?:set -a|\.)\s*.*\.env/m);
  assert.doesNotMatch(hookBody, /\. "\$\(git rev-parse/);
  fs.writeFileSync(
    path.join(dir, "dump-env.mjs"),
    `import fs from "node:fs";
import { fileURLToPath } from "node:url";
const out = {
  DATABASE_URL: process.env.DATABASE_URL ?? null,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL ?? null,
  marker: process.env.IH35_PRECHECK_PARENT_MARKER ?? null,
};
fs.writeFileSync(fileURLToPath(new URL("./env-dump.json", import.meta.url)), JSON.stringify(out));
`,
    "utf8"
  );
  const pkg = {
    name: "fixture",
    private: true,
    type: "module",
    scripts: {
      "branch:precheck-push": "node ./dump-env.mjs",
    },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2), "utf8");
  const hookPath = path.join(dir, "pre-push-hook.sh");
  fs.writeFileSync(hookPath, hookBody, { mode: 0o755 });

  const parentMarker = "parent-env-not-overridden";
  const parentEnv = cleanChildEnv({
    IH35_PRECHECK_PARENT_MARKER: parentMarker,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    npm_config_cache: process.env.npm_config_cache,
  });

  const hookRun = spawnSync("sh", [hookPath], {
    cwd: dir,
    encoding: "utf8",
    env: parentEnv,
  });
  assert.equal(hookRun.status, 0, hookRun.stderr || hookRun.stdout);
  const hookDump = JSON.parse(fs.readFileSync(path.join(dir, "env-dump.json"), "utf8"));
  assert.equal(hookDump.DATABASE_URL, null, "hook must not load hostile .env DATABASE_URL");
  assert.equal(hookDump.DATABASE_DIRECT_URL, null);
  assert.equal(hookDump.marker, parentMarker);

  fs.rmSync(path.join(dir, "env-dump.json"), { force: true });
  const directRun = spawnSync("npm", ["run", "branch:precheck-push"], {
    cwd: dir,
    encoding: "utf8",
    env: parentEnv,
  });
  assert.equal(directRun.status, 0, directRun.stderr || directRun.stdout);
  const directDump = JSON.parse(fs.readFileSync(path.join(dir, "env-dump.json"), "utf8"));
  assert.deepEqual(directDump, hookDump, "hook and direct precheck must see identical env");
});

test("validated local-ci TCP probe marks database capability for CI verify URL", async () => {
  const listener = await listenLocalTcp();
  try {
    // Prove the real TCP probe path: CI-port URL shape uses isLocalVerifyDatabaseUrl(:54329).
    // Host a temporary accept on 54329 only if free; otherwise mock is unnecessary — unit test
    // above covers probe true/false. Here prove probeLocalVerifyTcp against a live listener via
    // owned dynamic port + detectLocalCapabilities ownership path still green with real TCP up.
    const vlciRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-vlci-tcp-"));
    const session = createOwnerSession(vlciRoot);
    const dataDir = path.join(session.tempRoot, "pgdata-tcp");
    fs.mkdirSync(dataDir, { mode: 0o700 });
    session.updateBindings({
      dataDir,
      port: listener.port,
      database: "ih35_verify",
      url: listener.url,
    });
    try {
      const caps = detectLocalCapabilities(session.childEnv(cleanChildEnv()), {
        root: vlciRoot,
      });
      assert.equal(caps.database, true);
      assert.equal(caps.databaseSource, "vlci-owned");
    } finally {
      session.release();
      fs.rmSync(vlciRoot, { recursive: true, force: true });
    }
  } finally {
    await listener.close();
  }
});

test("real TCP probe accepts live local listener and rejects dead port", async () => {
  const { probeLocalVerifyTcp } = await import("../branch-precheck-push.mjs");
  const listener = await listenLocalTcp();
  try {
    assert.equal(probeLocalVerifyTcp(listener.url), true);
    assert.equal(probeLocalVerifyTcp("postgresql://verify:verify@127.0.0.1:1/ih35_verify"), false);
    assert.equal(probeLocalVerifyTcp(HOSTILE_NEON_URL), false);
  } finally {
    await listener.close();
  }
});
