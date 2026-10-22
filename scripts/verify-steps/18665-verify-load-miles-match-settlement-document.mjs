#!/usr/bin/env node
/**
 * CC-3 claim 18665 — LEAD 443.240: load miles come from the signed settlement (document → AlwaysTrack → lane history → Google;
 * a document value is locked). Static + LIVE (USMCA, read-only). See scripts/verify-load-miles-match-settlement-document.mjs.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-load-miles-match-settlement-document.mjs");

export default {
  name: "verify-load-miles-match-settlement-document",
  run() {
    const selftest = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (selftest.status !== 0) throw new Error(`verify-load-miles-match-settlement-document --selftest failed (exit ${selftest.status})`);
    const live = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (live.status !== 0) throw new Error(`verify-load-miles-match-settlement-document failed (exit ${live.status})`);
    return 0;
  },
};
