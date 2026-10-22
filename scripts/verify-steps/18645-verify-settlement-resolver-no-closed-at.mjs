#!/usr/bin/env node
/**
 * LEAD 443.210R P0 (CC-1 claim 18645) — settlement-resolution.sql.ts must use `trip_closed_at`,
 * not `closed_at` (no such column on driver_finance.driver_settlements). Static; also runs --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-settlement-resolver-no-closed-at.mjs");

export default {
  name: "verify-settlement-resolver-no-closed-at",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-settlement-resolver-no-closed-at${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
