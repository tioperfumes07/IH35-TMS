import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("verify:equipment-types-no-collision passes when DATABASE_URL is unset (skip)", () => {
  const res = spawnSync("node", ["scripts/verify-equipment-types-no-collision.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "", DATABASE_DIRECT_URL: "" },
    encoding: "utf8",
  });
  if (res.status === 0) return;
  if (String(res.stderr || res.stdout).includes("DATABASE_URL not set")) return;
  throw new Error(res.stderr || res.stdout);
});
