import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

test("verify:dispatch-secondary-nav-depth passes on current tree", () => {
  const out = execSync("npm run verify:dispatch-secondary-nav-depth", { encoding: "utf8" });
  assert.match(out, /PASS/);
});
