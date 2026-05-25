import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-qbo-webhook-fail-closed.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/verify-qbo-webhook-fail-closed");

test("passes for honest fail-closed implementation fixture", () => {
  const route = path.resolve(fixturesRoot, "positive/qbo-webhook.routes.ts");
  const run = spawnSync("node", [scriptPath, "--route", route], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify-qbo-webhook-fail-closed: ok/);
});

test("fails for legacy boot-throw implementation fixture", () => {
  const route = path.resolve(fixturesRoot, "negative/qbo-webhook.routes.ts");
  const run = spawnSync("node", [scriptPath, "--route", route], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /rule-1/);
});
