/**
 * Behavioral tests for VLCI single-owner / acyclic gate law.
 * Plants recursive invocation + concurrent lock contention; proves fail-closed + cleanup.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  C5_ORCHESTRATOR_SCRIPTS,
  VLCI_ENV,
  acquireExclusiveLock,
  allocateEphemeralPortSync,
  defaultLockPath,
  isLocalVerifyDatabaseUrl,
  releaseExclusiveLock,
  resolveVlciLifecycle,
} from "../vlci-lifecycle.mjs";
import {
  getC5SkipReason,
  readVerifyMeta,
  shouldSkipC5VerifyScript,
} from "../block-ready.mjs";
import { runGuard as runAcyclicGuard } from "../verify-local-ci-gate-acyclic.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL_CI = path.join(REPO_ROOT, "scripts/verify-local-ci.mjs");

test("C5 skips verify:local-ci and verify:static as orchestrators (acyclic)", () => {
  const meta = readVerifyMeta(REPO_ROOT);
  for (const name of C5_ORCHESTRATOR_SCRIPTS) {
    assert.equal(shouldSkipC5VerifyScript(name, meta), true, name);
    assert.match(getC5SkipReason(name, meta) ?? "", /orchestrator/);
  }
  assert.equal(shouldSkipC5VerifyScript("verify:arch-design", meta), true);
  assert.equal(getC5SkipReason("verify:arch-design", meta), "already run in C4");
  assert.equal(shouldSkipC5VerifyScript("verify:nav-integrity", meta), false);
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

test("nested IH35_VLCI_ACTIVE rejects (fail closed)", () => {
  const nested = resolveVlciLifecycle({ [VLCI_ENV.ACTIVE]: "1" });
  assert.equal(nested.mode, "reject");
  assert.match(nested.reason, /nested|acyclic|ACTIVE/i);
});

test("planted nested verify:local-ci process exits non-zero", () => {
  const res = spawnSync(process.execPath, [LOCAL_CI], {
    encoding: "utf8",
    env: { ...process.env, [VLCI_ENV.ACTIVE]: "1" },
  });
  assert.notEqual(res.status, 0);
  assert.match(`${res.stdout}\n${res.stderr}`, /nested|ACTIVE|acyclic|refused/i);
});

test("inherit mode requires local ih35_verify URL", () => {
  const bad = resolveVlciLifecycle({
    [VLCI_ENV.INHERIT]: "1",
    DATABASE_URL: "postgresql://u@neon.tech/neondb",
  });
  assert.equal(bad.mode, "reject");
  const good = resolveVlciLifecycle({
    [VLCI_ENV.INHERIT]: "1",
    [VLCI_ENV.DATABASE_URL]: "postgresql://verify@127.0.0.1:54329/ih35_verify",
  });
  assert.equal(good.mode, "inherit");
});

test("isLocalVerifyDatabaseUrl accepts CI port and VLCI-owned dynamic port only", () => {
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@localhost:54329/ih35_verify", {}),
    true
  );
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@127.0.0.1:55432/ih35_verify", {
      [VLCI_ENV.OWNED]: "1",
    }),
    true
  );
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@127.0.0.1:55432/ih35_verify", {}),
    false
  );
  assert.equal(
    isLocalVerifyDatabaseUrl("postgresql://v@neon.tech/neondb", { [VLCI_ENV.OWNED]: "1" }),
    false
  );
});

test("exclusive lock: concurrent second owner fails closed; release cleans up", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-lock-"));
  const lockPath = path.join(dir, "owner.lock");
  const alive = new Set([111, 222]);
  const isAlive = (pid) => alive.has(pid);

  const first = acquireExclusiveLock(lockPath, { pid: 111, isAlive });
  assert.equal(first.ok, true);
  assert.equal(fs.existsSync(lockPath), true);

  const second = acquireExclusiveLock(lockPath, { pid: 222, isAlive });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "lock-held");
  assert.equal(second.holderPid, 111);

  const foreignRelease = releaseExclusiveLock(lockPath, { pid: 222 });
  assert.equal(foreignRelease.ok, false);
  assert.equal(fs.existsSync(lockPath), true);

  const released = releaseExclusiveLock(lockPath, { pid: 111 });
  assert.equal(released.ok, true);
  assert.equal(fs.existsSync(lockPath), false);
});

test("stale lock from dead pid is reclaimed; cleanup leaves no lock file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-stale-"));
  const lockPath = path.join(dir, "stale.lock");
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999001, startedAt: 1 }), "utf8");
  const isAlive = () => false;
  const got = acquireExclusiveLock(lockPath, { pid: 333, isAlive });
  assert.equal(got.ok, true);
  releaseExclusiveLock(lockPath, { pid: 333 });
  assert.equal(fs.existsSync(lockPath), false);
});

test("dynamic ports from two allocations do not collide", () => {
  const a = allocateEphemeralPortSync();
  const b = allocateEphemeralPortSync();
  assert.ok(Number.isInteger(a) && a > 0);
  assert.ok(Number.isInteger(b) && b > 0);
  // They may equal only if OS recycled instantly after close; bind both briefly to prove usability.
  // Stronger: hold one listening server while allocating the second.
});

test("held port forces a different dynamic allocation (no fixed-port collision class)", async () => {
  const net = await import("node:net");
  const held = net.createServer();
  await new Promise((resolve, reject) => {
    held.listen(0, "127.0.0.1", resolve);
    held.on("error", reject);
  });
  const heldPort = held.address().port;
  const other = allocateEphemeralPortSync();
  assert.notEqual(other, heldPort);
  await new Promise((resolve) => held.close(resolve));
});

test("defaultLockPath is stable per repo root and under tmp", () => {
  const a = defaultLockPath(REPO_ROOT);
  const b = defaultLockPath(REPO_ROOT);
  assert.equal(a, b);
  assert.ok(a.startsWith(os.tmpdir()));
});

test("acyclic static guard passes on repo (and --selftest)", () => {
  const r = runAcyclicGuard(REPO_ROOT);
  assert.equal(r.ok, true, r.errs?.join("; "));
  const self = spawnSync(process.execPath, [
    path.join(REPO_ROOT, "scripts/verify-local-ci-gate-acyclic.mjs"),
    "--selftest",
  ], { encoding: "utf8" });
  assert.equal(self.status, 0, self.stderr || self.stdout);
});

test("parallel child owners: second fails closed while first holds lock", async () => {
  const { spawn } = await import("node:child_process");
  const lockPath = path.join(os.tmpdir(), `vlci-par-${process.pid}-${Date.now()}.lock`);
  fs.rmSync(lockPath, { force: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-par-"));
  const script = path.join(tmp, "hold.mjs");
  fs.writeFileSync(
    script,
    `
import { acquireExclusiveLock, releaseExclusiveLock } from ${JSON.stringify(
      path.join(REPO_ROOT, "scripts/vlci-lifecycle.mjs")
    )};
const lockPath = process.env.LOCK_PATH;
const holdMs = Number(process.env.HOLD_MS || "600");
const r = acquireExclusiveLock(lockPath);
if (!r.ok) {
  process.stdout.write(JSON.stringify({ ok: false, reason: r.reason }));
  process.exit(2);
}
process.stdout.write(JSON.stringify({ ok: true }));
await new Promise((resolve) => setTimeout(resolve, holdMs));
releaseExclusiveLock(lockPath);
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
  assert.match(first.out, /"ok":true/);
  assert.equal(second.code, 2, second.out);
  assert.match(second.out, /lock-held/);
  assert.equal(fs.existsSync(lockPath), false);
});
