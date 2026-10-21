#!/usr/bin/env node
/**
 * LEAD 443.204 (CC-2) — current drivers (DQ file on paper, owner 10-21) are recorded, never blocked, by the shared
 * driver-qualification gate; recorded violations still block; a new driver needs the full file at create.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-driver-dq-gate-grandfather.mjs");

export default {
  name: "verify-driver-dq-gate-grandfather",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-driver-dq-gate-grandfather${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
