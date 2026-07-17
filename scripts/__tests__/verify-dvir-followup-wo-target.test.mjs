import { execSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";

test("verify:dvir-followup-wo-target --selftest passes", () => {
  const out = execSync("node scripts/verify-dvir-followup-wo-target.mjs --selftest", {
    encoding: "utf8",
  });
  assert.match(out, /verify-dvir-followup-wo-target --selftest PASS/);
});

test("verify:dvir-followup-wo-target passes on current tree", () => {
  const out = execSync("npm run verify:dvir-followup-wo-target", { encoding: "utf8" });
  assert.match(out, /verify-dvir-followup-wo-target PASS/);
});
