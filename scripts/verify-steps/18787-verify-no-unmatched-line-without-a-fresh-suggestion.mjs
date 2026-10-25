#!/usr/bin/env node
/** CC-2 claim 18787 — LEAD 443.341 RC5. See scripts/verify-no-unmatched-line-without-a-fresh-suggestion.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-no-unmatched-line-without-a-fresh-suggestion.mjs");

export default {
  name: "verify-no-unmatched-line-without-a-fresh-suggestion",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-no-unmatched-line-without-a-fresh-suggestion failed (exit ${r.status})`);
    return 0;
  },
};
