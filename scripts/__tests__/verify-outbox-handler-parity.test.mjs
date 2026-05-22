import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-outbox-handler-parity.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/outbox-handler-parity");

test("fails when emitter has no handler", () => {
  const srcRoot = path.resolve(fixturesRoot, "orphan/src");
  const registry = path.resolve(fixturesRoot, "orphan/registry.ts");
  const run = spawnSync("node", [scriptPath, "--src-root", srcRoot, "--registry", registry], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Emitter event_types with no registered handler/);
  assert.match(run.stderr, /orphan\.event/);
});

test("passes when emitter and handlers match", () => {
  const srcRoot = path.resolve(fixturesRoot, "ok/src");
  const registry = path.resolve(fixturesRoot, "ok/registry.ts");
  const run = spawnSync("node", [scriptPath, "--src-root", srcRoot, "--registry", registry], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:outbox-handler-parity OK/);
});
