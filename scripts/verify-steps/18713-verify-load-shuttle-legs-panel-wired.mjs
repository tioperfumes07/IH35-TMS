#!/usr/bin/env node
/** CC-3 claim 18713 — LEAD 443.266-A item 3. See scripts/verify-load-shuttle-legs-panel-wired.mjs (static, with selftest). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-load-shuttle-legs-panel-wired.mjs");

export default {
  name: "verify-load-shuttle-legs-panel-wired",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-load-shuttle-legs-panel-wired ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
