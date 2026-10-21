#!/usr/bin/env node
/**
 * LEAD 443.202 (CC-2) — the England Logistics WEX card statement import is idempotent per (WEX invoice, item), posts on
 * receipt Dr fuel / Cr 2520 through the one poster, adopts a settlement's receipt, and a later Settlement Creator WEX
 * line adopts the received fill by shape (never a second row). Static; also runs the guard's --selftest.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-wex-import-idempotent-and-adoptable.mjs");

export default {
  name: "verify-wex-import-idempotent-and-adoptable",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-wex-import-idempotent-and-adoptable${args.length ? " --selftest" : ""} failed (exit ${r.status})`);
    }
    return 0;
  },
};
