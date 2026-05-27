import test from "node:test";
import assert from "node:assert/strict";
import { verifyNoOrphanRouteAliases } from "../verify-no-orphan-route-aliases.mjs";

test("verifyNoOrphanRouteAliases validates manifest aliases", () => {
  assert.doesNotThrow(() => verifyNoOrphanRouteAliases());
});
