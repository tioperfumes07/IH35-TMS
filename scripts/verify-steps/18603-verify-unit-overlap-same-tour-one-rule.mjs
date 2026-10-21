#!/usr/bin/env node
/**
 * LEAD 443.209 (CC-2) — one unit-overlap rule in both layers: the same tour's sequential leg is not an overlap; every
 * other second active load on a unit is refused (app gate + deferred DB backstop). Static; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-unit-overlap-same-tour-one-rule.mjs");

export default {
  name: "verify-unit-overlap-same-tour-one-rule",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-unit-overlap-same-tour-one-rule${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
