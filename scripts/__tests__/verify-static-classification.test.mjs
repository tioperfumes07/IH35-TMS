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

test("missing capability without named CI equivalent is a hard test failure", () => {
  const fixture = makeFixture({ source: 'console.log("unused");' });
  const preflight = capabilityPreflight(fixture.file, {
    root: fixture.root,
    dependenciesAvailable: false,
    databaseAvailable: true,
    policy: { dbGated: new Set(), equivalents: {} },
  });
  const result = classify(fixture.file, { preflight });
  assert.equal(result.kind, STATIC_RESULT_CATEGORIES.FAIL_TEST);
  assert.match(result.detail, /lacks named server-required CI equivalent/);
});

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
