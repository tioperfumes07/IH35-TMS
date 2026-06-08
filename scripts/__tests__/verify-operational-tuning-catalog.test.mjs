import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("verify:operational-tuning-catalog passes on repo", () => {
  execSync("node scripts/verify-operational-tuning-catalog.mjs", {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
});

test("catalog has all eight category sections", () => {
  const out = execSync("node scripts/verify-operational-tuning-catalog.mjs", {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(out, /OK \(\d+ entries\)/);
});
