#!/usr/bin/env node
/**
 * LEAD 443.219 G-STRICT (CC-1 claim 18637) — each named list route parses through strictListQuery;
 * params sent by screens are actually read; the strict helper keeps both halves; the int8 parser
 * is registered before any pool. Static, no DB; also runs the --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-list-query-params-honoured.mjs");

export default {
  name: "verify-list-query-params-honoured",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-list-query-params-honoured${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
