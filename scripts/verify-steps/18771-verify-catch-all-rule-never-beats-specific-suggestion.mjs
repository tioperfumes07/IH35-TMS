#!/usr/bin/env node
/** CC-2 claim 18771 — LEAD 443.341 RC1–RC6. See scripts/verify-catch-all-rule-never-beats-specific-suggestion.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-catch-all-rule-never-beats-specific-suggestion.mjs");

export default {
  name: "verify-catch-all-rule-never-beats-specific-suggestion",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-catch-all-rule-never-beats-specific-suggestion failed (exit ${r.status})`);
    return 0;
  },
};
