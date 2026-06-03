import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.resolve(root, "scripts/verify-dispatch-coming-soon-triage.mjs");

test("verify-dispatch-coming-soon-triage passes on current tree", () => {
  const out = execFileSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, VERIFY_DISPATCH_COMING_SOON_ROOT: root },
  });
  assert.match(out, /OK/);
});
