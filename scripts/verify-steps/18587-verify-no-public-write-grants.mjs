#!/usr/bin/env node
/**
 * ROUND 443.198 (CC-2) — no migration grants a write privilege TO PUBLIC (static, always). The guard's LIVE half (zero
 * PUBLIC write privileges / defaults on the database) runs where DATABASE_URL is the read-only prod guard reader; here it
 * runs static-only (DATABASE_URL withheld) because CI's own migrated DB still carries 0167/0168's PUBLIC grants until the
 * Lead's 443.198 revoke migration is applied. Also runs the guard's --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-no-public-write-grants.mjs");

export default {
  name: "verify-no-public-write-grants",
  run() {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_DIRECT_URL;
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, env, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-no-public-write-grants${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
