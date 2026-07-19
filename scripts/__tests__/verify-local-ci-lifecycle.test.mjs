/**
 * Behavioral + planted-attack tests for VLCI single-owner / unforgeable ownership law.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  C5_ORCHESTRATOR_SCRIPTS,
  VLCI_ENV,
  acquireExclusiveLock,
  allocateEphemeralPortSync,
  canonicalLockPath,
  createOwnerSession,
  createPrivateTempRoot,
  isAddressInUseError,
  isLocalVerifyDatabaseUrl,
  releaseExclusiveLock,
  resolveCanonicalLockPath,
  resolveVlciLifecycle,
  validateOwnershipProof,
} from "../vlci-lifecycle.mjs";
import { startEphemeralPgWithRetry } from "../verify-local-ci.mjs";
import {
  clearStaticSweepProof,
  ensureVerifyStaticOnce,
  hasTrustedStaticSweepProof,
  mintStaticSweepProof,
} from "../static-sweep-proof.mjs";
import {
  getC5SkipReason,
  readVerifyMeta,
  shouldSkipC5VerifyScript,
} from "../block-ready.mjs";
import { buildPrecheckSteps } from "../branch-precheck-push.mjs";
import { runGuard as runAcyclicGuard } from "../verify-local-ci-gate-acyclic.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL_CI = path.join(REPO_ROOT, "scripts/verify-local-ci.mjs");
const HARNESS = path.join(REPO_ROOT, "scripts/dev/vlci-lifecycle-harness.mjs");

test("C5 skips verify:local-ci and verify:static as orchestrators (acyclic)", () => {
  const meta = readVerifyMeta(REPO_ROOT);
  for (const name of C5_ORCHESTRATOR_SCRIPTS) {
    assert.equal(shouldSkipC5VerifyScript(name, meta), true, name);
    assert.match(getC5SkipReason(name, meta) ?? "", /orchestrator/);
  }
});

test("planted C5 script plan must not execute verify:local-ci", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const meta = readVerifyMeta(REPO_ROOT);
  const gated = new Set(meta.db_gated_verify_scripts ?? []);
  const runnable = Object.keys(pkg.scripts)
    .filter((n) => n.startsWith("verify:"))
    .filter((n) => !gated.has(n))
    .filter((n) => !shouldSkipC5VerifyScript(n, meta));
  assert.equal(runnable.includes("verify:local-ci"), false);
  assert.equal(runnable.includes("verify:static"), false);
});

test("pre-push buildPrecheckSteps does not duplicate verify:static", () => {
  const steps = buildPrecheckSteps(REPO_ROOT);
  assert.equal(steps.some((s) => s.label === "verify-static"), false);
  assert.equal(steps.some((s) => s.label === "block-ready"), true);
});

test("attack: OWNED=1 alone does not authorize dynamic localhost URL", () => {
  const url = "postgresql://v@127.0.0.1:55432/ih35_verify";
  assert.equal(
    isLocalVerifyDatabaseUrl(url, { [VLCI_ENV.OWNED]: "1" }, { repoRoot: REPO_ROOT }),
    false
  );
  const lifecycle = resolveVlciLifecycle(
    { [VLCI_ENV.OWNED]: "1", DATABASE_URL: url },
    { repoRoot: REPO_ROOT }
  );
  assert.equal(lifecycle.mode, "reject");
});

test("attack: INHERIT=1 alone does not authorize", () => {
  const lifecycle = resolveVlciLifecycle(
    {
      [VLCI_ENV.INHERIT]: "1",
      [VLCI_ENV.DATABASE_URL]: "postgresql://v@127.0.0.1:54329/ih35_verify",
    },
    { repoRoot: REPO_ROOT }
  );
  assert.equal(lifecycle.mode, "reject");
  assert.match(lifecycle.reason, /TOKEN|lock\+token|authorize/i);
});

test("attack: custom IH35_VLCI_LOCK_PATH rejected", () => {
  const res = resolveCanonicalLockPath(REPO_ROOT, {
    [VLCI_ENV.LOCK_PATH]: path.join(os.tmpdir(), "evil-vlci.lock"),
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /LOCK_PATH|canonical/i);
  const lifecycle = resolveVlciLifecycle(
    { [VLCI_ENV.LOCK_PATH]: "/tmp/evil.lock", [VLCI_ENV.TOKEN]: "a".repeat(64) },
    { repoRoot: REPO_ROOT }
  );
  assert.equal(lifecycle.mode, "reject");
});

test("attack: localhost:5432/ih35_verify without ownership proof rejected", () => {
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@localhost:5432/ih35_verify", {}, { repoRoot: REPO_ROOT }),
    false
  );
  assert.equal(
    isLocalVerifyDatabaseUrl(
      "postgresql://v@localhost:5432/ih35_verify",
      { [VLCI_ENV.OWNED]: "1" },
      { repoRoot: REPO_ROOT }
    ),
    false
  );
});

test("CI port 54329 still accepted without VLCI proof", () => {
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@localhost:54329/ih35_verify", {}, { repoRoot: REPO_ROOT }),
    true
  );
});

function tempRepoRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vlci-repo-${label}-`));
}

function sessionDataDir(session, label) {
  const dataDir = fs.mkdtempSync(path.join(session.tempRoot, `${label}-`));
  fs.chmodSync(dataDir, 0o700);
  return dataDir;
}

test("attack: copied/stale token rejected after lock release", () => {
  const repo = tempRepoRoot("stale");
  const session = createOwnerSession(repo);
  const url = `postgresql://v@127.0.0.1:55111/ih35_verify`;
  const dataDir = sessionDataDir(session, "stale-token-data");
  session.updateBindings({ dataDir, port: 55111, database: "ih35_verify", url });
  const stolenEnv = session.childEnv({});
  session.release();
  fs.rmSync(dataDir, { recursive: true, force: true });

  const proof = validateOwnershipProof(stolenEnv, { repoRoot: repo, requireBindings: true });
  assert.equal(proof.ok, false);
  assert.match(proof.reason, /lock-missing|token|dead/i);

  const lifecycle = resolveVlciLifecycle(stolenEnv, { repoRoot: repo });
  assert.equal(lifecycle.mode, "reject");
});

test("attack: wrong pid / dataDir / port vs lock rejected", () => {
  const repo = tempRepoRoot("bind");
  const session = createOwnerSession(repo);
  const dataDir = sessionDataDir(session, "binding-data");
  const url = `postgresql://v@127.0.0.1:55222/ih35_verify`;
  session.updateBindings({ dataDir, port: 55222, database: "ih35_verify", url });
  try {
    const base = session.childEnv({});
    assert.equal(
      validateOwnershipProof(
        { ...base, [VLCI_ENV.OWNER_PID]: "1" },
        { repoRoot: repo }
      ).ok,
      false
    );
    assert.equal(
      validateOwnershipProof(
        { ...base, [VLCI_ENV.DATADIR]: path.join(os.tmpdir(), "wrong-data") },
        { repoRoot: repo }
      ).ok,
      false
    );
    assert.equal(
      validateOwnershipProof(
        { ...base, [VLCI_ENV.PORT]: "1" },
        { repoRoot: repo }
      ).ok,
      false
    );
    assert.equal(
      validateOwnershipProof(
        { ...base, DATABASE_URL: "postgresql://v@127.0.0.1:55223/ih35_verify" },
        { repoRoot: repo }
      ).ok,
      false
    );
    // Correct bindings succeed
    assert.equal(validateOwnershipProof(base, { repoRoot: repo }).ok, true);
    assert.equal(isLocalVerifyDatabaseUrl(url, base, { repoRoot: repo }), true);
  } finally {
    session.release();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("valid inherit requires token+lock+bindings (not INHERIT flag)", () => {
  const repo = tempRepoRoot("inh");
  const session = createOwnerSession(repo);
  const dataDir = sessionDataDir(session, "inherit-data");
  const url = `postgresql://v@127.0.0.1:55333/ih35_verify`;
  session.updateBindings({ dataDir, port: 55333, database: "ih35_verify", url });
  try {
    const env = session.childEnv({});
    delete env[VLCI_ENV.INHERIT];
    delete env[VLCI_ENV.OWNED];
    const lifecycle = resolveVlciLifecycle(env, { repoRoot: repo });
    assert.equal(lifecycle.mode, "inherit");
    assert.equal(lifecycle.url, url);
  } finally {
    session.release();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("exclusive lock: concurrent second owner fails closed; release cleans up", () => {
  const lockPath = canonicalLockPath(path.join(os.tmpdir(), `vlci-lock-${process.pid}`));
  fs.rmSync(lockPath, { force: true });
  const alive = new Set([111, 222]);
  const isAlive = (pid) => alive.has(pid);
  const first = acquireExclusiveLock(lockPath, { pid: 111, isAlive, token: "a".repeat(64) });
  assert.equal(first.ok, true);
  const second = acquireExclusiveLock(lockPath, { pid: 222, isAlive, token: "b".repeat(64) });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "lock-held");
  const released = releaseExclusiveLock(lockPath, { pid: 111, token: "a".repeat(64) });
  assert.equal(released.ok, true);
  assert.equal(fs.existsSync(lockPath), false);
});

test("private owner session uses 0700 roots and 0600 lock with current ownership", () => {
  const repo = tempRepoRoot("private-mode");
  const session = createOwnerSession(repo);
  const dataDir = sessionDataDir(session, "mode-data");
  const url = "postgresql://v@127.0.0.1:55444/ih35_verify";
  session.updateBindings({ dataDir, port: 55444, database: "ih35_verify", url });
  const tempRoot = session.tempRoot;
  try {
    const tempStat = fs.lstatSync(tempRoot);
    const dataStat = fs.lstatSync(dataDir);
    const lockStat = fs.lstatSync(session.lockPath);
    assert.equal(tempStat.isDirectory(), true);
    assert.equal(dataStat.isDirectory(), true);
    assert.equal(lockStat.isFile(), true);
    assert.equal(tempStat.isSymbolicLink(), false);
    assert.equal(lockStat.isSymbolicLink(), false);
    if (process.platform !== "win32") {
      assert.equal(tempStat.mode & 0o777, 0o700);
      assert.equal(dataStat.mode & 0o777, 0o700);
      assert.equal(lockStat.mode & 0o777, 0o600);
    }
    if (typeof process.getuid === "function") {
      assert.equal(tempStat.uid, process.getuid());
      assert.equal(dataStat.uid, process.getuid());
      assert.equal(lockStat.uid, process.getuid());
    }
    assert.equal(validateOwnershipProof(session.childEnv({}), { repoRoot: repo }).ok, true);
  } finally {
    session.release();
    fs.rmSync(repo, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(tempRoot), false, "release removes private run root");
});

test("attack: symlink and pre-created collision are rejected without touching targets", () => {
  const root = createPrivateTempRoot();
  const victim = path.join(root, "victim");
  const symlinkLock = path.join(root, "symlink.lock");
  const collisionLock = path.join(root, "collision.lock");
  fs.writeFileSync(victim, "preserve\n", { encoding: "utf8", mode: 0o600 });
  fs.symlinkSync(victim, symlinkLock);
  fs.writeFileSync(collisionLock, "attacker-controlled\n", { encoding: "utf8", mode: 0o600 });
  try {
    const symlinkAttempt = acquireExclusiveLock(symlinkLock, { token: "d".repeat(64) });
    assert.equal(symlinkAttempt.ok, false);
    assert.match(symlinkAttempt.reason, /unsafe-private-file|lock-held-unreadable/);
    assert.equal(fs.readFileSync(victim, "utf8"), "preserve\n");
    assert.equal(fs.lstatSync(symlinkLock).isSymbolicLink(), true);

    const collisionAttempt = acquireExclusiveLock(collisionLock, { token: "e".repeat(64) });
    assert.equal(collisionAttempt.ok, false);
    assert.equal(collisionAttempt.reason, "lock-held-unreadable");
    assert.equal(fs.readFileSync(collisionLock, "utf8"), "attacker-controlled\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("port TOCTOU: stolen first port retries and succeeds; cleans failed attempt", () => {
  const held = allocateEphemeralPortSync();
  // Simulate: first allocate returns held port (stolen), start fails EADDRINUSE; second succeeds.
  let calls = 0;
  const fakeDirs = [];
  const pg = startEphemeralPgWithRetry("/unused", {
    maxAttempts: 3,
    allocatePort: () => {
      calls += 1;
      return calls === 1 ? held : allocateEphemeralPortSync();
    },
    startOnPort: (port) => {
      if (port === held) {
        const err = new Error("address already in use");
        err.code = "EADDRINUSE";
        throw err;
      }
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-toctou-"));
      fakeDirs.push(dataDir);
      fs.writeFileSync(path.join(dataDir, "ok"), "1");
      return {
        dataDir,
        port,
        stop() {
          fs.rmSync(dataDir, { recursive: true, force: true });
        },
      };
    },
  });
  assert.ok(calls >= 2);
  assert.notEqual(pg.port, held);
  assert.equal(isAddressInUseError({ code: "EADDRINUSE" }), true);
  pg.stop();
  for (const d of fakeDirs) {
    assert.equal(fs.existsSync(d), false);
  }
});

test("SIGINT on live harness cleans dataDir + releases lock", async () => {
  const markerRoot = createPrivateTempRoot();
  const donePath = path.join(markerRoot, "done.json");
  const child = spawn(process.execPath, [HARNESS, "--hold-ms", "8000"], {
    env: { ...process.env, IH35_VLCI_HARNESS_REPO: REPO_ROOT, IH35_VLCI_HARNESS_DONE: donePath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("harness ready timeout")), 5000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
    child.on("error", reject);
  });
  assert.equal(ready.ready, true);
  assert.equal(fs.existsSync(ready.dataDir), true);
  assert.equal(fs.existsSync(ready.lockPath), true);

  child.kill("SIGINT");
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 130);
  // Allow handler to flush done marker
  for (let i = 0; i < 20 && !fs.existsSync(donePath); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(fs.existsSync(ready.dataDir), false, "dataDir cleaned");
  assert.equal(fs.existsSync(ready.lockPath), false, "lock released");
  if (fs.existsSync(donePath)) {
    const done = JSON.parse(fs.readFileSync(donePath, "utf8"));
    assert.equal(done.cleaned, true);
    fs.rmSync(donePath, { force: true });
  }
  fs.rmSync(markerRoot, { recursive: true, force: true });
});

test("SIGTERM on live harness cleans dataDir + releases lock", async () => {
  const markerRoot = createPrivateTempRoot();
  const donePath = path.join(markerRoot, "done.json");
  const child = spawn(process.execPath, [HARNESS, "--hold-ms", "8000"], {
    env: { ...process.env, IH35_VLCI_HARNESS_REPO: REPO_ROOT, IH35_VLCI_HARNESS_DONE: donePath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("harness ready timeout")), 5000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
    child.on("error", reject);
  });
  child.kill("SIGTERM");
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 143);
  for (let i = 0; i < 20 && fs.existsSync(ready.dataDir); i += 1) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(fs.existsSync(ready.dataDir), false);
  assert.equal(fs.existsSync(ready.lockPath), false);
  fs.rmSync(donePath, { force: true });
  fs.rmSync(markerRoot, { recursive: true, force: true });
});

test("static sweep proof is in-process only (env cannot mint)", () => {
  clearStaticSweepProof();
  assert.equal(hasTrustedStaticSweepProof(), false);
  process.env.IH35_STATIC_SWEEP_PROOF = "forged";
  assert.equal(hasTrustedStaticSweepProof(), false);
  mintStaticSweepProof({ source: "test" });
  assert.equal(hasTrustedStaticSweepProof(), true);
  const once = ensureVerifyStaticOnce({
    root: REPO_ROOT,
    run: () => {
      throw new Error("should not run when proof present");
    },
  });
  assert.equal(once.skipped, true);
  clearStaticSweepProof();
  delete process.env.IH35_STATIC_SWEEP_PROOF;
});

test("ensureVerifyStaticOnce fail-closed when runner fails and no proof", () => {
  clearStaticSweepProof();
  assert.throws(
    () =>
      ensureVerifyStaticOnce({
        root: REPO_ROOT,
        run: () => ({ ok: false, detail: "planted fail" }),
      }),
    /fail closed|failed/i
  );
  assert.equal(hasTrustedStaticSweepProof(), false);
});

test("planted nested verify:local-ci without token fails (lock or free-env)", () => {
  const res = spawnSync(process.execPath, [LOCAL_CI], {
    encoding: "utf8",
    env: { ...process.env, [VLCI_ENV.ACTIVE]: "1", [VLCI_ENV.OWNED]: "1" },
  });
  assert.notEqual(res.status, 0);
});

test("parallel child owners: second fails closed while first holds lock", async () => {
  const tmp = createPrivateTempRoot();
  const lockPath = path.join(tmp, "parallel.lock");
  const script = path.join(tmp, "hold.mjs");
  fs.writeFileSync(
    script,
    `
import { acquireExclusiveLock, releaseExclusiveLock } from ${JSON.stringify(
      path.join(REPO_ROOT, "scripts/vlci-lifecycle.mjs")
    )};
const lockPath = process.env.LOCK_PATH;
const holdMs = Number(process.env.HOLD_MS || "600");
const r = acquireExclusiveLock(lockPath, { token: "c".repeat(64) });
if (!r.ok) {
  process.stdout.write(JSON.stringify({ ok: false, reason: r.reason }));
  process.exit(2);
}
process.stdout.write(JSON.stringify({ ok: true }));
await new Promise((resolve) => setTimeout(resolve, holdMs));
releaseExclusiveLock(lockPath, { token: "c".repeat(64) });
process.exit(0);
`,
    "utf8"
  );

  const runChild = () =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [script], {
        env: { ...process.env, LOCK_PATH: lockPath, HOLD_MS: "700" },
      });
      let out = "";
      child.stdout.on("data", (d) => {
        out += d;
      });
      child.stderr.on("data", (d) => {
        out += d;
      });
      child.on("close", (code) => resolve({ code, out }));
    });

  const firstPromise = runChild();
  await new Promise((r) => setTimeout(r, 80));
  const second = await runChild();
  const first = await firstPromise;
  assert.equal(first.code, 0, first.out);
  assert.equal(second.code, 2, second.out);
  assert.match(second.out, /lock-held/);
  assert.equal(fs.existsSync(lockPath), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("acyclic static guard passes on repo (and --selftest)", () => {
  const r = runAcyclicGuard(REPO_ROOT);
  assert.equal(r.ok, true, r.errs?.join("; "));
  const self = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts/verify-local-ci-gate-acyclic.mjs"), "--selftest"],
    { encoding: "utf8" }
  );
  assert.equal(self.status, 0, self.stderr || self.stdout);
});
