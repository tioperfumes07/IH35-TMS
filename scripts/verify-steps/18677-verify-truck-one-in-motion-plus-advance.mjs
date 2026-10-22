#!/usr/bin/env node
/** CC-3 claim 18677 — LEAD 443.244. See scripts/verify-truck-one-in-motion-plus-advance.mjs (static + LIVE). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-truck-one-in-motion-plus-advance.mjs");

export default {
  name: "verify-truck-one-in-motion-plus-advance",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-truck-one-in-motion-plus-advance ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
