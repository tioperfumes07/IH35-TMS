import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.join(ROOT, "scripts", "verify-redis-resilient-config.mjs");

test("verify:redis-resilient-config passes on current tree", () => {
  const out = execFileSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(out, /verify:redis-resilient-config OK/);
});
