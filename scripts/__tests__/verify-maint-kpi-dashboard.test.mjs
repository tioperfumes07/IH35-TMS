import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import path from "node:path";

test("verify:maint-kpi-dashboard passes on complete tree", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const out = execSync("node scripts/verify-maint-kpi-dashboard.mjs", { cwd: root, encoding: "utf8" });
  assert.match(out, /PASS/);
});
