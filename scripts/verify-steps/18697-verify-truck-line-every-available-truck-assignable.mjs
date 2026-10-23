#!/usr/bin/env node
/** CC-3 claim 18697 — LEAD 443.257-A. See scripts/verify-truck-line-every-available-truck-assignable.mjs (static, with selftest). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-truck-line-every-available-truck-assignable.mjs");

export default {
  name: "verify-truck-line-every-available-truck-assignable",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-truck-line-every-available-truck-assignable ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
