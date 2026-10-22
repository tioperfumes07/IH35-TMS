#!/usr/bin/env node
/** CC-3 claim 18673 — LEAD 443.243. See scripts/verify-nb-left-driver-does-not-occupy-presettlement.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-nb-left-driver-does-not-occupy-presettlement.mjs");

export default {
  name: "verify-nb-left-driver-does-not-occupy-presettlement",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-nb-left-driver-does-not-occupy-presettlement ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
