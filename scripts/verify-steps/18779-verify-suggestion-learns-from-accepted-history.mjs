#!/usr/bin/env node
/** CC-2 claim 18779 — LEAD 443.341 RC3. See scripts/verify-suggestion-learns-from-accepted-history.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-suggestion-learns-from-accepted-history.mjs");

export default {
  name: "verify-suggestion-learns-from-accepted-history",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-suggestion-learns-from-accepted-history failed (exit ${r.status})`);
    return 0;
  },
};
