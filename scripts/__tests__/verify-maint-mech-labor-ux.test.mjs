import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";
test("verify:maint-mech-labor-ux passes", () => {
  const out = execSync("npm run verify:maint-mech-labor-ux", { encoding: "utf8" });
  assert.match(out, /verify:maint-mech-labor-ux PASS/);
});
