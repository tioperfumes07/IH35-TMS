#!/usr/bin/env node
/** CC-2 claim 18791 — LEAD 443.341 RC6. See scripts/verify-relay-fill-driver-equals-load-driver.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-relay-fill-driver-equals-load-driver.mjs");

export default {
  name: "verify-relay-fill-driver-equals-load-driver",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-relay-fill-driver-equals-load-driver failed (exit ${r.status})`);
    return 0;
  },
};
