#!/usr/bin/env node
/**
 * LEAD 443.217 (CC-2) — no z.coerce.boolean( in application code ("false" parsed as TRUE inverted 102 routes; Load Costs
 * showed cancelled loads). Static; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-no-coerce-boolean.mjs");

export default {
  name: "verify-no-coerce-boolean",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-no-coerce-boolean${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
