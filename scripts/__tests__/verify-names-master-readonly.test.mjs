import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("verify:names-master-readonly", () => {
  it("passes on repo routes file", () => {
    const out = execFileSync("node", ["scripts/verify-names-master-readonly.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toContain("PASS");
  });
});
