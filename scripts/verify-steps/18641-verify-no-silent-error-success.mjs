#!/usr/bin/env node
/**
 * LEAD 443.219 G-ERR (CC-1 claim 18641) — a failure is never shown as a success.
 * Static + frontend source; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-no-silent-error-success.mjs");

export default {
  name: "verify-no-silent-error-success",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-no-silent-error-success${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
