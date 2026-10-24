#!/usr/bin/env node
/** CC-2 claim 18687 — LEAD 443.304 row 77. See scripts/verify-factoring-collection-closes-invoice.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-factoring-collection-closes-invoice.mjs");

export default {
  name: "verify-factoring-collection-closes-invoice",
  run() {
    const selftest = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (selftest.status !== 0) throw new Error(`verify-factoring-collection-closes-invoice --selftest failed (exit ${selftest.status})`);
    const live = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (live.status !== 0) throw new Error(`verify-factoring-collection-closes-invoice live failed (exit ${live.status})`);
    return 0;
  },
};
