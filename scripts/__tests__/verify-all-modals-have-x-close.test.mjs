import { test } from "node:test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("verify:all-modals-have-x-close passes on current modal inventory", () => {
  const out = execSync("node scripts/verify-all-modals-have-x-close.mjs", {
    cwd: root,
    encoding: "utf8",
  });
  if (!out.includes("PASS")) {
    throw new Error(out);
  }
});
