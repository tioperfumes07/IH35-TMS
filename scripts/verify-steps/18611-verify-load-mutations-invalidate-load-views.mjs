#!/usr/bin/env node
/**
 * LEAD 443.208R (CC-2) — every load/money mutation is tagged meta.loads and refreshes every load view; every loads/detail key carries the company. Static; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-load-mutations-invalidate-load-views.mjs");

export default {
  name: "verify-load-mutations-invalidate-load-views",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-load-mutations-invalidate-load-views${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
