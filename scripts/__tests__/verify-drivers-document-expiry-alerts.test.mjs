import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("verify-drivers-document-expiry-alerts", () => {
  it("passes when A24-9 artifacts exist", () => {
    const res = spawnSync("node", ["scripts/verify-drivers-document-expiry-alerts.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr || res.stdout);
    assert.match(res.stdout, /OK/);
  });
});
