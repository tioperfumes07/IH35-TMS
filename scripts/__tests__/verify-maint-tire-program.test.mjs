import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

test("verify:maint-tire-program passes on current tree", () => {
  const out = execSync("npm run verify:maint-tire-program", { encoding: "utf8" });
  assert.match(out, /verify:maint-tire-program PASS/);
});
