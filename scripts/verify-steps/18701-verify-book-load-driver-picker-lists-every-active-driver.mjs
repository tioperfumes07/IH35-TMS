#!/usr/bin/env node
/** CC-3 claim 18701 — LEAD 443.257-B. See scripts/verify-book-load-driver-picker-lists-every-active-driver.mjs (static, with selftest). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-book-load-driver-picker-lists-every-active-driver.mjs");

export default {
  name: "verify-book-load-driver-picker-lists-every-active-driver",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-book-load-driver-picker-lists-every-active-driver ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
