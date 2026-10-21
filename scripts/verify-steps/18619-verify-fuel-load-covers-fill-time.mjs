#!/usr/bin/env node
/**
 * LEAD 443.214 (CC-2) — a GPS-resolved fill sits on its GPS truck's load covering the pump moment; no Relay fill without its time. Runs --static + --selftest here; the live count runs where the gate credential is set.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-fuel-load-covers-fill-time.mjs");

export default {
  name: "verify-fuel-load-covers-fill-time",
  run() {
    for (const args of [["--static"], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-fuel-load-covers-fill-time ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
