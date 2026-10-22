#!/usr/bin/env node
/**
 * LEAD 443.206R (CC-1 claim 18633) — ONE load status label (lib/load-status.ts), shared status sets,
 * ONE isDraftLoad definition, distinct planner cache keys, no mis-keyed detail cache.
 * Static (frontend source only); also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-fe-load-labels-and-status-sets.mjs");

export default {
  name: "verify-fe-load-labels-and-status-sets",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-fe-load-labels-and-status-sets${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
