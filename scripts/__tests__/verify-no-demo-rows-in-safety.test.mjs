import test from "node:test";
import assert from "node:assert/strict";
import { verifyNoDemoRowsInSafety } from "../verify-no-demo-rows-in-safety.mjs";

test("verifyNoDemoRowsInSafety passes current safety pages", () => {
  assert.doesNotThrow(() => verifyNoDemoRowsInSafety());
});
