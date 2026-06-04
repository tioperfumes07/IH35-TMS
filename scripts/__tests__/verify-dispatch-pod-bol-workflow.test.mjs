import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("verify:dispatch-pod-bol-workflow passes on current tree", () => {
  const script = path.join(process.cwd(), "scripts/verify-dispatch-pod-bol-workflow.mjs");
  const res = spawnSync(process.execPath, [script], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout);
  }
});
