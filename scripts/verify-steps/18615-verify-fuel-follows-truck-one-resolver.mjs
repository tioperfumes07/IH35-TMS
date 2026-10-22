#!/usr/bin/env node
/**
 * LEAD 443.214 (CC-2) — fuel follows the truck at the pump: ONE resolver (provider moment → GPS truck → the one load rule), moves through the engine. Static; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-fuel-follows-truck-one-resolver.mjs");

export default {
  name: "verify-fuel-follows-truck-one-resolver",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-fuel-follows-truck-one-resolver ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
