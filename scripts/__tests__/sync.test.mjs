import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { computeRecommendedNext } from "../sync.mjs";

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/sync"
);

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, name, "state.json"), "utf8"));
}

test("dirty tree recommends commit+block ship", () => {
  const fixture = readFixture("dirty");
  const next = computeRecommendedNext(fixture);
  assert.match(next, /git add -A/);
});

test("behind main recommends rebuild-linear", () => {
  const fixture = readFixture("behind");
  const next = computeRecommendedNext(fixture);
  assert.match(next, /branch:rebuild-linear/);
});

test("already merged upstream recommends cleanup", () => {
  const fixture = readFixture("merged-upstream");
  const next = computeRecommendedNext(fixture);
  assert.match(next, /git branch -D/);
});

test("ahead clean recommends precheck", () => {
  const fixture = readFixture("ahead-clean");
  const next = computeRecommendedNext(fixture);
  assert.equal(next, "npm run branch:precheck-push");
});
