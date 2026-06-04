import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(ROOT, "scripts/verify-rls-uuid-cast-nullif.mjs");

describe("verify-rls-uuid-cast-nullif", () => {
  it("passes on repo migrations", () => {
    const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr || res.stdout);
    assert.match(res.stdout, /PASS/);
  });
});
