import { execSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";

test("verify:maint-inspections-crud passes on current tree", () => {
  const out = execSync("npm run verify:maint-inspections-crud", { encoding: "utf8" });
  assert.match(out, /verify:maint-inspections-crud PASS/);
});
