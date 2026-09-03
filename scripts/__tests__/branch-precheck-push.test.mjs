import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";
import {
  GATE_RESULT_CATEGORIES,
  attemptStaleBaseRecovery,
  buildPrecheckSteps,
  computeMainDeltaFiles,
  deltaTouchesAnyGuard,
  detectLocalCapabilities,
  preflightStep,
  probeVerifyDatabaseIdentity,
  resolvePrecheckSteps,
  runPrecheckPush,
} from "../branch-precheck-push.mjs";
import { VLCI_ENV, createOwnerSession } from "../vlci-lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-precheck-push.mjs");
const prePushHookPath = path.resolve(root, ".husky/pre-push");
const mockPgServerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/branch-tooling/mock-pg-server.mjs"
);
const HOSTILE_NEON_URL =
  "postgresql://neondb_owner:BAD_PASSWORD_NOT_REAL@ep-hostile-stale.us-east-2.aws.neon.tech/neondb?sslmode=require";
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

// The DB identity probe validates capability with a SYNCHRONOUS spawnSync child. spawnSync freezes
// this test's event loop, so any mock that answers the probe MUST live in a separate process — an
// in-process listener would be frozen and every probe would "pass" only by timing out (a fake
// green). We start the wire-protocol mock as its own process and wait (async) for its port BEFORE
// invoking the sync probe.
function startMockPgServer({ mode = "ok" } = {}) {
  const child = spawn(process.execPath, [mockPgServerPath], {
    env: { ...process.env, MOCK_MODE: mode },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/MOCK_PG_PORT=(\d+)/);
      if (!m) return;
      child.stdout.off("data", onData);
      const port = Number(m[1]);
      resolve({
        port,
        url: `postgresql://verify:verify@127.0.0.1:${port}/ih35_verify`,
        close: () =>
          new Promise((r) => {
            child.once("exit", () => r());
            child.kill("SIGKILL");
          }),
      });
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    const guard = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("mock pg server did not report a port in time"));
    }, 5000);
    if (typeof guard.unref === "function") guard.unref();
  });
}

function stubVerifyStaticFallback(dir) {
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/verify-static.mjs"), "process.exit(0);\n", "utf8");
}

function writeMinimalPackage(dir, { buildBackendExit = 0 } = {}) {
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
          "build:backend": `node -e "process.exit(${buildBackendExit})"`,
          "block-ready": "node -e \"process.exit(0)\"",
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

function writeCapabilityPolicyFixture(dir) {
  // Minimal, valid capability-policy inputs so the production CLI chain (whose built-in block-ready
  // step declares requiredCapabilities:["database"]) can LOAD its policy without throwing. Empty
  // server_required_live_status_checks means loadCapabilityPolicy makes no `gh` network call.
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/verify-meta.json"), "{}\n", "utf8");
  // Rule 25: first precheck step runs money-pr-local-gate — stub so fixture CLI can reach later steps.
  fs.writeFileSync(path.join(dir, "scripts/money-pr-local-gate.mjs"), "process.exit(0);\n", "utf8");
  fs.mkdirSync(path.join(dir, ".github"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".github/branch-protection-config.json"), "{}\n", "utf8");
}

function makeFeatureRepo(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-precheck-"));
  initFixtureRepo(dir);
  writeMinimalPackage(dir, options);
  writeCapabilityPolicyFixture(dir);
  fs.writeFileSync(path.join(dir, "README.md"), "main\n", "utf8");
  runGitOrThrow(
    [
      "add",
      "README.md",
      "package.json",
      "apps/frontend/tsconfig.json",
      "scripts/verify-meta.json",
      "scripts/money-pr-local-gate.mjs",
      ".github/branch-protection-config.json",
    ],
    { cwd: dir }
  );
  runGitOrThrow(["commit", "-m", "main"], { cwd: dir });
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/precheck"], { cwd: dir });
  writeAndCommit(dir, "change.txt", "x\n", "feature");
  return dir;
}

function markerWriteCommand(markerPath) {
  const script = `require("fs").writeFileSync(${JSON.stringify(markerPath)}, "ran")`;
  return `node -e ${JSON.stringify(script)}`;
}

// ── Branch / freshness / dirty / conflict guards (in-process; steps only via function options) ──────
test("refuses main branch", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.BRANCH);
});

// FRESHNESS IS BY OVERLAP, NOT BY DISTANCE (2026-07-30). This case previously asserted the opposite —
// that being ANY commits behind origin/main refuses — which is the defect, not the contract. CI's
// verify-branch-fresh.mjs had already moved to the overlap rule, so the two enforcement points
// disagreed: a branch CI would merge without complaint could not even be pushed, and every unrelated
// merge invalidated every open branch. The cases below pin BOTH directions so neither can regress.
test("allows behind origin/main when the changed files are disjoint", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "ahead.txt", "ahead\n", "main moved");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, true, result.reason);
});

test("refuses when behind origin/main AND the same file changed", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  // `change.txt` is the file the feature branch itself edits in makeFeatureRepo().
  writeAndCommit(dir, "change.txt", "main edited the same file\n", "main moved");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.FRESHNESS);
});

// TOOL-F02: this previously asserted that ANY two migrations conflict, on the belief that numbering is
// "strictly above main's max". scripts/db-migrate.mjs is LEDGER-BASED — it applies every migration not
// already in the ledger over a filename-sorted list, with no max comparison — so a lower number still
// applies when merged later. The old rule invalidated every migration PR on every other migration
// merge. Both directions are pinned now.
test("allows both sides adding migrations with DIFFERENT numbers", () => {
  const dir = makeFeatureRepo();
  writeAndCommit(dir, "db/migrations/202610270000_mine.sql", "-- mine\n", "branch migration");
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "db/migrations/202610261200_theirs.sql", "-- theirs\n", "main migration");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, true, result.reason);
});

test("refuses when both sides claim the SAME migration number", () => {
  const dir = makeFeatureRepo();
  writeAndCommit(dir, "db/migrations/202610270000_mine.sql", "-- mine\n", "branch migration");
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "db/migrations/202610270000_theirs.sql", "-- theirs\n", "main migration");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.FRESHNESS);
});

test("allows two guard PRs claiming DIFFERENT verify-step numbers", () => {
  const dir = makeFeatureRepo();
  writeAndCommit(dir, "scripts/verify-steps/1795-mine.mjs", "// mine\n", "branch guard");
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "scripts/verify-steps/1806-theirs.mjs", "// theirs\n", "main guard");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, true, result.reason);
});

test("refuses when both sides claim the SAME verify-step number", () => {
  const dir = makeFeatureRepo();
  writeAndCommit(dir, "scripts/verify-steps/1795-mine.mjs", "// mine\n", "branch guard");
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "scripts/verify-steps/1795-theirs.mjs", "// theirs\n", "main guard");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: [] });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.FRESHNESS);
});

test("runs verify chain and reports ready", () => {
  const dir = makeFeatureRepo();
  const passSteps = [
    { label: "build-backend", command: 'node -e "process.exit(0)"' },
    { label: "block-ready", command: 'node -e "process.exit(0)"' },
  ];
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: passSteps });
  assert.equal(result.ok, true, result.reason);
  assert.match(result.message, /READY TO PUSH: feat\/precheck/);
});

test("surfaces failing verify step", () => {
  const dir = makeFeatureRepo();
  const failSteps = [{ label: "verify:fixture-fail", command: 'node -e "process.exit(1)"' }];
  const result = runPrecheckPush({ root: dir, skipFetch: true, steps: failSteps });
  assert.equal(result.ok, false);
  assert.equal(result.category, GATE_RESULT_CATEGORIES.TEST);
  assert.equal(result.step, "verify:fixture-fail");
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

// ── Capability preflight policy ─────────────────────────────────────────────────────────────────────
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

// ── Real pg identity probe: fake-TCP / wrong-schema / wrong-auth / correct ──────────────────────────
test("raw TCP listener is not a verify database capability", async () => {
  const server = await startMockPgServer({ mode: "raw" });
  try {
    // A bare TCP acceptor speaks no Postgres protocol → pg handshake fails → probe false.
    assert.equal(probeVerifyDatabaseIdentity(server.url, { timeoutMs: 2000 }), false);
    // Dead port and remote/prod URL are also false (prod is refused before any connection).
    assert.equal(
      probeVerifyDatabaseIdentity("postgresql://verify:verify@127.0.0.1:1/ih35_verify", { timeoutMs: 1000 }),
      false
    );
    assert.equal(probeVerifyDatabaseIdentity(HOSTILE_NEON_URL, { timeoutMs: 1000 }), false);
  } finally {
    await server.close();
  }
});

test("wrong current_database is not a verify database capability", async () => {
  const server = await startMockPgServer({ mode: "wrongdb" });
  try {
    // Authenticated real pg handshake succeeds, but current_database() !== 'ih35_verify' → false.
    assert.equal(probeVerifyDatabaseIdentity(server.url, { timeoutMs: 2000 }), false);
  } finally {
    await server.close();
  }
});

test("wrong credentials are not a verify database capability", async () => {
  const server = await startMockPgServer({ mode: "authfail" });
  try {
    // Server rejects authentication (28P01) → pg connect rejects → probe false.
    assert.equal(probeVerifyDatabaseIdentity(server.url, { timeoutMs: 2000 }), false);
  } finally {
    await server.close();
  }
});

test("authenticated ih35_verify identity is a verify database capability", async () => {
  const server = await startMockPgServer({ mode: "ok" });
  try {
    assert.equal(probeVerifyDatabaseIdentity(server.url, { timeoutMs: 2000 }), true);
  } finally {
    await server.close();
  }
});

// ── detectLocalCapabilities: string presence never authorizes; only a live authenticated probe does ──
test("stale Neon DATABASE_URL string alone is never a database capability", () => {
  const caps = detectLocalCapabilities(
    { DATABASE_URL: HOSTILE_NEON_URL, DATABASE_DIRECT_URL: HOSTILE_NEON_URL },
    { root, probeDb: () => true }
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
    { root, probeDb: () => true }
  );
  assert.equal(caps.database, false);
});

test("CI local-verify URL requires a validated authenticated connection", () => {
  const dead = detectLocalCapabilities(
    { DATABASE_URL: "postgresql://verify:verify@127.0.0.1:54329/ih35_verify" },
    { root, probeDb: () => false }
  );
  assert.equal(dead.database, false);

  const live = detectLocalCapabilities(
    { DATABASE_URL: "postgresql://verify:verify@127.0.0.1:54329/ih35_verify" },
    { root, probeDb: () => true }
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
    // Strip free-form URL; ownership proof selects the owned url, live probe (mocked) confirms it.
    delete env.DATABASE_URL;
    delete env.DATABASE_DIRECT_URL;
    const caps = detectLocalCapabilities(env, { root: vlciRoot, probeDb: () => true });
    assert.equal(caps.database, true);
    assert.equal(caps.databaseSource, "vlci-owned");
  } finally {
    session.release();
    fs.rmSync(vlciRoot, { recursive: true, force: true });
  }
});

test("owned VLCI lock without a live ih35_verify database is not a capability", () => {
  const vlciRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-vlci-dead-"));
  const session = createOwnerSession(vlciRoot);
  const dataDir = path.join(session.tempRoot, "pgdata-dead");
  fs.mkdirSync(dataDir, { mode: 0o700 });
  const url = "postgresql://v@127.0.0.1:55323/ih35_verify";
  session.updateBindings({ dataDir, port: 55323, database: "ih35_verify", url });
  try {
    const env = session.childEnv(cleanChildEnv());
    // Ownership proof passes, but the owned database is not actually live → probe false → fail closed.
    const caps = detectLocalCapabilities(env, { root: vlciRoot, probeDb: () => false });
    assert.equal(caps.database, false);
    assert.equal(caps.databaseSource, null);
  } finally {
    session.release();
    fs.rmSync(vlciRoot, { recursive: true, force: true });
  }
});

test("owned VLCI session with a live mock ih35_verify server passes the real pg identity probe", async () => {
  const server = await startMockPgServer({ mode: "ok" });
  const vlciRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-vlci-live-"));
  const session = createOwnerSession(vlciRoot);
  const dataDir = path.join(session.tempRoot, "pgdata-live");
  fs.mkdirSync(dataDir, { mode: 0o700 });
  session.updateBindings({
    dataDir,
    port: server.port,
    database: "ih35_verify",
    url: server.url,
  });
  try {
    // No injected probe → uses the REAL probeVerifyDatabaseIdentity against the live mock server.
    const caps = detectLocalCapabilities(session.childEnv(cleanChildEnv()), { root: vlciRoot });
    assert.equal(caps.database, true);
    assert.equal(caps.databaseSource, "vlci-owned");
  } finally {
    session.release();
    fs.rmSync(vlciRoot, { recursive: true, force: true });
    await server.close();
  }
});

// ── Precheck integration: stale env skips block-ready; owned context runs it ────────────────────────
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
    probeDb: () => true,
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
      // Owned lifecycle authorizes the url; the live-DB probe is mocked up (real DB not spun here).
      probeDb: () => true,
    });
    assert.equal(result.ok, true, result.reason);
    assert.equal(fs.readFileSync(marker, "utf8"), "ran");
    assert.equal(result.skippedCapabilities?.length ?? 0, 0);
  } finally {
    session.release();
  }
});

// ── Hook / env isolation ────────────────────────────────────────────────────────────────────────────
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

// ── Closed all-gates bypass: env can neither inject nor empty gate steps, nor skip fetch ────────────
test("environment BRANCH_PRECHECK_STEPS_JSON cannot inject or empty gate steps", () => {
  const builtin = buildPrecheckSteps(root);
  // No caller option → the full built-in production chain, regardless of any env.
  assert.deepEqual(resolvePrecheckSteps({}, root), builtin);
  assert.ok(builtin.length >= 4, "built-in chain must not be empty");
  assert.equal(
    builtin[0]?.label,
    "money-pr-local-gate",
    "Rule 25: money-pr-local-gate must be the FIRST pre-push step (fail-fast)"
  );
  // Only a direct caller option (tests) may inject steps.
  const injected = [{ label: "x", command: 'node -e "process.exit(0)"' }];
  assert.deepEqual(resolvePrecheckSteps({ steps: injected }, root), injected);
  // resolvePrecheckSteps takes no env argument at all — env is structurally unable to influence it.
  assert.ok(resolvePrecheckSteps.length <= 2);
});

test("production CLI ignores BRANCH_PRECHECK_STEPS_JSON and IH35_BRANCH_TOOLING_SKIP_FETCH bypass", () => {
  // Fixture whose real build:backend gate fails — if the CLI honored the empty-step + skip-fetch
  // bypass it would print READY and exit 0. It must instead run the real chain and fail closed.
  const dir = makeFeatureRepo({ buildBackendExit: 1 });
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...cleanChildEnv(),
      IH35_BRANCH_TOOLING_ROOT: dir,
      BRANCH_PRECHECK_STEPS_JSON: "[]",
      IH35_BRANCH_TOOLING_SKIP_FETCH: "1",
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      npm_config_cache: process.env.npm_config_cache,
    },
  });
  assert.notEqual(run.status, 0, "CLI must not succeed under an empty-step/skip-fetch bypass");
  const combined = `${run.stdout}\n${run.stderr}`;
  assert.doesNotMatch(combined, /READY TO PUSH/, "empty-step bypass must not short-circuit to READY");
  assert.match(combined, /money-pr-local-gate/, "Rule 25 fail-fast step must execute first");
  assert.match(combined, /build-backend/, "the real built-in gate chain must have executed");
});

// TOOL-F05: a branch that ADDS A MIGRATION must have replayed it against a real database before push.
// Enforced by a dedicated `migration-db-replay` step with NO serverRequiredCiEquivalent — deferring to
// CI is exactly what sent three broken migrations to CI and one to production on 2026-07-30, where it
// blocked every deploy for ~5.5 hours. It is deliberately NOT done by making `block-ready` unskippable:
// that step also needs a registered .block-ready manifest, which would trade one blocker for another.
test("a migration branch gets the migration-db-replay step", () => {
  const dir = makeFeatureRepo();
  writeAndCommit(dir, "db/migrations/202610990000_x.sql", "-- x\n", "branch migration");
  const steps = buildPrecheckSteps(dir);
  const replay = steps.find((s) => s.label === "migration-db-replay");
  assert.ok(replay, "migration branch must get the replay step");
  assert.match(replay.command, /verify:db:reset/);
  // TOOL-F06: the step must supply its own DATABASE_URL. Relying on the ambient environment forces the
  // caller to export it, which turns the global "database" capability true and makes block-ready run
  // and demand a .block-ready manifest — reintroducing the very coupling TOOL-F05 set out to avoid.
  assert.match(replay.command, /^DATABASE_URL=postgres:\/\/verify:verify@127\.0\.0\.1:54329\/ih35_verify /);
  assert.equal(replay.serverRequiredCiEquivalent, undefined, "must NOT be deferrable to CI");
  // No requiredCapabilities on purpose: declaring "database" would make the global capability decide
  // it, and once that capability is true `block-ready` also runs and demands a .block-ready manifest —
  // coupling migration safety to registry ceremony. verify-db-reset refuses safely on its own.
  assert.equal(replay.requiredCapabilities, undefined, "must not join the capability system");
});

test("a NON-migration branch does not get the replay step", () => {
  const dir = makeFeatureRepo();
  assert.equal(buildPrecheckSteps(dir).find((s) => s.label === "migration-db-replay"), undefined);
});

test("the replay step always runs — its command refuses safely when no database is up", () => {
  const step = { label: "migration-db-replay", command: "npm run verify:db:reset" };
  // With no requiredCapabilities the preflight always says run; verify-db-reset.mjs then refuses
  // unless DATABASE_URL is a local verify database, printing the commands to start one.
  assert.equal(preflightStep(step, { database: false }, validCapabilityPolicy).action, "run");
  assert.equal(preflightStep(step, { database: true }, validCapabilityPolicy).action, "run");
});

test("block-ready keeps its CI-equivalent skip — migrations are not coupled to manifest ceremony", () => {
  const step = { label: "block-ready", requiredCapabilities: ["database"], serverRequiredCiEquivalent: "ci / build-typecheck" };
  assert.equal(preflightStep(step, { database: false }, validCapabilityPolicy).action, "skip-capability");
});

// ── GATE-LIVELOCK-01 STEP 2: stale-base recovery (rebase + delta-scoped re-check only) ──────────────

function makeFeatureRepoWithGuard(guardName, guardSource) {
  const dir = makeFeatureRepo();
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", guardName), guardSource, "utf8");
  // Register it as CI-run the same way real guards are: a scripts/verify-steps/ wrapper file
  // whose content names it. Without this, ciRunGuardSet() sees it as "unwired" and a real FAIL
  // is informational-only — exactly the existing FAIL-test(gated)/FAIL-test(unwired) split.
  fs.mkdirSync(path.join(dir, "scripts/verify-steps"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "scripts/verify-steps", `9999-${guardName}`),
    `import "../${guardName}";\n`,
    "utf8"
  );
  runGitOrThrow(["add", `scripts/${guardName}`, `scripts/verify-steps/9999-${guardName}`], { cwd: dir });
  runGitOrThrow(["commit", "-m", `add ${guardName}`], { cwd: dir });
  runGitOrThrow(["push", "origin", "feat/precheck"], { cwd: dir });
  return dir;
}

test("computeMainDeltaFiles: empty when main has not moved past the merge-base", () => {
  const dir = makeFeatureRepo();
  assert.deepEqual(computeMainDeltaFiles(dir), []);
});

test("computeMainDeltaFiles: lists exactly the files main advanced by", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "docs/unrelated.md", "hi\n", "main moved, unrelated file");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  assert.deepEqual(computeMainDeltaFiles(dir), ["docs/unrelated.md"]);
});

test("deltaTouchesAnyGuard: false for a file no guard owns", () => {
  const map = { entries: { "verify-x.mjs": { ownedPaths: ["apps/backend/src/y.ts"], alwaysRun: false } } };
  assert.equal(deltaTouchesAnyGuard(["docs/unrelated.md"], map), false);
});

test("deltaTouchesAnyGuard: true when a delta file is under an owned path", () => {
  const map = { entries: { "verify-x.mjs": { ownedPaths: ["apps/backend/src/"], alwaysRun: false } } };
  assert.equal(deltaTouchesAnyGuard(["apps/backend/src/y.ts"], map), true);
});

test("deltaTouchesAnyGuard: alwaysRun guards never trigger a delta-only re-check", () => {
  const map = { entries: { "verify-x.mjs": { ownedPaths: [], alwaysRun: true } } };
  assert.equal(deltaTouchesAnyGuard(["anything.ts"], map), false);
});

test("attemptStaleBaseRecovery: delta touches nothing any guard owns — rebases, runs no guard", () => {
  const dir = makeFeatureRepoWithGuard(
    "verify-owns-backend.mjs",
    // Owns "apps/backend/src/x.ts" — not alwaysRun (has an extractable path), and the delta
    // below (docs/unrelated.md) does not intersect it.
    `const OWNED = "apps/backend/src/x.ts";\nconsole.error("planted: must never run when delta is out of scope"); process.exit(1);\n`
  );
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "docs/unrelated.md", "hi\n", "main moved, unrelated file");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = attemptStaleBaseRecovery(dir);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.ranGuards, false);
  assert.equal(runGitOrThrow(["log", "-1", "--format=%s", "origin/main"], { cwd: dir }), "main moved, unrelated file");
});

test("attemptStaleBaseRecovery: delta touches an owned path — the owning guard runs and can fail the recovery", () => {
  const dir = makeFeatureRepoWithGuard(
    "verify-owns-touched.mjs",
    `console.error("planted failure — must surface in the recovery result"); process.exit(1);\n`
  );
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "apps/backend/src/touched.ts", "export const x = 1;\n", "main moved, owned path");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  // Rewrite the guard so its only extractable path literal matches what main just changed.
  fs.writeFileSync(
    path.join(dir, "scripts/verify-owns-touched.mjs"),
    `// owns "apps/backend/src/touched.ts"\nconsole.error("planted failure — must surface in the recovery result"); process.exit(1);\n`
  );
  runGitOrThrow(["add", "scripts/verify-owns-touched.mjs"], { cwd: dir });
  runGitOrThrow(["commit", "-m", "guard now owns the path main will touch"], { cwd: dir });
  const result = attemptStaleBaseRecovery(dir);
  assert.equal(result.ok, false);
  assert.match(result.reason, /verify-owns-touched\.mjs/);
});

test("attemptStaleBaseRecovery: a real rebase conflict aborts cleanly, never leaves the repo mid-rebase", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "change.txt", "main edited the same line differently\n", "main moved, conflicting");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const result = attemptStaleBaseRecovery(dir);
  assert.equal(result.ok, false);
  assert.match(result.reason, /conflict/i);
  const status = runGitOrThrow(["status", "--porcelain=v1", "-z"], { cwd: dir });
  assert.equal(status, "", "working tree must be clean after an aborted rebase");
  assert.equal(fs.existsSync(path.join(dir, ".git", "rebase-merge")), false);
  assert.equal(fs.existsSync(path.join(dir, ".git", "rebase-apply")), false);
});
