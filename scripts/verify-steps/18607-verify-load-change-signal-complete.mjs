#!/usr/bin/env node
/**
 * LEAD 443.208R (CC-2) — every load table signals at commit; the bus listens on the direct endpoint, catches up, and every open screen of the company refreshes. Static; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-load-change-signal-complete.mjs");

export default {
  name: "verify-load-change-signal-complete",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-load-change-signal-complete${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
