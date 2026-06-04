import { execSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";

test("verify:maint-pm-auto-wo-engine passes on current tree", () => {
  const out = execSync("npm run verify:maint-pm-auto-wo-engine", { encoding: "utf8" });
  assert.match(out, /verify:maint-pm-auto-wo-engine PASS/);
});
