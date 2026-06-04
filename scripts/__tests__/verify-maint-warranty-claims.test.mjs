import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

test("verify:maint-warranty-claims passes on current tree", () => {
  const out = execSync("npm run verify:maint-warranty-claims", { encoding: "utf8" });
  assert.match(out, /verify:maint-warranty-claims PASS/);
});
