#!/usr/bin/env node
/**
 * LEAD 443.243 — Fuel Assignment popup UI + question surfaces. Cursor EVEN 18670.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-fuel-assignment-popup.mjs");

export default {
  name: "verify-fuel-assignment-popup",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) {
        throw new Error(`verify-fuel-assignment-popup ${args.join(" ")} failed (exit ${r.status})`);
      }
    }
    return 0;
  },
};
