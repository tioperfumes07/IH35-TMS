#!/usr/bin/env node
/** CC-3 claim 18705 — LEAD 443.265-A. See scripts/verify-book-load-v3-layout.mjs (static, with selftest). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-book-load-v3-layout.mjs");

export default {
  name: "verify-book-load-v3-layout",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-book-load-v3-layout ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
