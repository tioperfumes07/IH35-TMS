import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  STATIC_RESULT_CATEGORIES,
  capabilityPreflight,
  classify,
} from "../verify-static.mjs";

function makeFixture({ source, verifyName = "verify:fixture", dbGated = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-static-classification-"));
  const scriptsDir = path.join(root, "scripts");
  fs.mkdirSync(scriptsDir);
  const file = path.join(scriptsDir, "verify-fixture.mjs");
  fs.writeFileSync(file, source, "utf8");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: { [verifyName]: "node scripts/verify-fixture.mjs" },
    }),
    "utf8"
  );
  const policy = {
    dbGated: new Set(dbGated),
    equivalents: {
      database: "ci / build-typecheck",
      dependencies: "ci / build-typecheck",
    },
    serverRequiredContexts: new Set(["ci / build-typecheck"]),
    requiredContexts: new Set(["ci / build-typecheck"]),
    wiredContexts: new Set(["ci / build-typecheck"]),
  };
  return { root, file, policy };
}

test("missing database is skipped only by explicit preflight with named CI equivalent", () => {
  const fixture = makeFixture({
    source: 'console.error("must not execute"); process.exit(1);',
    dbGated: ["verify:fixture"],
  });
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: true,
    databaseAvailable: false,
    policy: fixture.policy,
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  assert.match(result.detail, /database → ci \/ build-typecheck/);
});

test("missing dependencies are classified by explicit capability preflight", () => {
  const fixture = makeFixture({ source: 'console.log("unused");' });
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: false,
    databaseAvailable: true,
    policy: fixture.policy,
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  assert.match(result.detail, /dependencies → ci \/ build-typecheck/);
});

test("missing PR metadata skips HOLD approval only to the required hold-merge CI gate", () => {
  const context = "hold-merge-gate / hold-merge-gate";
  const fixture = makeFixture({
    source: 'console.error("local execution must not decide approval"); process.exit(1);',
    verifyName: "verify:hold-merge-gate",
  });
  const policy = {
    ...fixture.policy,
    equivalents: {
      ...fixture.policy.equivalents,
      "pull-request-metadata": context,
    },
    serverRequiredContexts: new Set([
      ...fixture.policy.serverRequiredContexts,
      context,
    ]),
    requiredContexts: new Set([...fixture.policy.requiredContexts, context]),
    wiredContexts: new Set([...fixture.policy.wiredContexts, context]),
    guardCapabilities: {
      "verify:hold-merge-gate": ["pull-request-metadata"],
    },
  };
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: true,
    databaseAvailable: true,
    capabilityAvailability: { "pull-request-metadata": false },
    policy,
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY);
  assert.equal(result.detail, `pull-request-metadata → ${context}`);
});

test("missing PR metadata hard-fails when the hold-merge CI gate is not required", () => {
  const context = "hold-merge-gate / hold-merge-gate";
  const fixture = makeFixture({
    source: 'console.error("local execution must not decide approval"); process.exit(1);',
    verifyName: "verify:hold-merge-gate",
  });
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: true,
    databaseAvailable: true,
    capabilityAvailability: { "pull-request-metadata": false },
    policy: {
      ...fixture.policy,
      equivalents: { "pull-request-metadata": context },
      serverRequiredContexts: new Set([context]),
      requiredContexts: new Set(),
      wiredContexts: new Set([context]),
      guardCapabilities: {
        "verify:hold-merge-gate": ["pull-request-metadata"],
      },
    },
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
  assert.match(result.detail, /not a required protection context/);
});

test("missing capability without named CI equivalent is a hard test failure", () => {
  const fixture = makeFixture({ source: 'console.log("unused");' });
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: false,
    databaseAvailable: true,
    policy: {
      dbGated: new Set(),
      equivalents: {},
      serverRequiredContexts: new Set(),
      requiredContexts: new Set(),
      wiredContexts: new Set(),
    },
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
  assert.match(result.detail, /no declared CI equivalent/);
});

for (const [label, policyPatch, expected] of [
  [
    "not server-required",
    { serverRequiredContexts: new Set() },
    /not declared server-required/,
  ],
  [
    "not required by protection",
    { requiredContexts: new Set() },
    /not a required protection context/,
  ],
  [
    "not wired",
    { wiredContexts: new Set() },
    /not wired to its declared workflow job/,
  ],
]) {
  test(`capability skip fails when CI equivalent is ${label}`, () => {
    const fixture = makeFixture({ source: 'console.log("unused");' });
    const policy = { ...fixture.policy, ...policyPatch };
    const preflight = capabilityPreflight(fixture.file, {
      root: fixture.root,
      dependenciesAvailable: false,
      databaseAvailable: true,
      policy,
    });
    const result = classify(fixture.file, { preflight });
    assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
    assert.match(result.detail, expected);
  });
}

test("DATABASE_URL text in a real assertion failure is never reclassified as a skip", () => {
  const fixture = makeFixture({
    source: 'console.error("assertion failed: DATABASE_URL text changed"); process.exit(1);',
  });
  const result = classify(fixture.file, {
    preflight: { ok: true, missing: [], ciEquivalents: [] },
  });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
  assert.match(result.detail, /DATABASE_URL text changed/);
});
