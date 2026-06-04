import { execSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";

test("verify:maint-vendor-master-unify passes on current tree", () => {
  const out = execSync("npm run verify:maint-vendor-master-unify", { encoding: "utf8" });
  assert.match(out, /verify:maint-vendor-master-unify PASS/);
});
