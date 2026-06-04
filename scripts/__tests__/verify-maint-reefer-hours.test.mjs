import { execSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("verify:maint-reefer-hours passes on current tree", () => {
  const out = execSync("npm run verify:maint-reefer-hours", { encoding: "utf8" });
  assert.match(out, /verify:maint-reefer-hours PASS/);
});
