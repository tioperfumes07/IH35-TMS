import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.resolve(root, "scripts/verify-maint-nav-count-reconcile.mjs");

test("verify-maint-nav-count-reconcile passes on current tree", () => {
  const out = execFileSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, VERIFY_MAINT_NAV_COUNT_RECONCILE_ROOT: root },
  });
  assert.match(out, /OK/);
});
