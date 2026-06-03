import { test } from "node:test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("verify:no-test-seed-in-prod-listings passes static route checks", () => {
  const out = execSync("node scripts/verify-no-test-seed-in-prod-listings.mjs", {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", DATABASE_DIRECT_URL: "" },
  });
  if (!out.includes("PASS")) {
    throw new Error(out);
  }
});
