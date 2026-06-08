import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { findDuplicateRoutes } from "../verify-no-duplicate-routes.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const fixtures = path.resolve(root, "scripts/__tests__/fixtures/no-duplicate-routes");

test("passes when no duplicate routes are registered", () => {
  const distRoot = path.resolve(fixtures, "positive/dist");
  const autoloadRoot = path.resolve(distRoot, "accounting");
  const { duplicates } = findDuplicateRoutes({ distRoot, autoloadRoot });
  assert.equal(duplicates.length, 0);
});

test("fails when a route is registered by autoload and manual path", () => {
  const distRoot = path.resolve(fixtures, "negative/dist");
  const autoloadRoot = path.resolve(distRoot, "accounting");
  const { duplicates } = findDuplicateRoutes({ distRoot, autoloadRoot });
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].key, "GET /api/v1/settlements/:settlementId/disputes");
});
