#!/usr/bin/env node
/** CC-2 claim 18783 — LEAD 443.341 RC4. See scripts/verify-bank-payee-parser.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-bank-payee-parser.mjs");

export default {
  name: "verify-bank-payee-parser",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-bank-payee-parser failed (exit ${r.status})`);
    return 0;
  },
};
