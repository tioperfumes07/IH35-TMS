#!/usr/bin/env node
/** CC-1 claim 18681 — LEAD 443.249 item 1. See scripts/verify-driver-bill-due-date-matches-delivery.mjs (LIVE). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-driver-bill-due-date-matches-delivery.mjs");

export default {
  name: "verify-driver-bill-due-date-matches-delivery",
  run() {
    const r = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-driver-bill-due-date-matches-delivery --selftest failed (exit ${r.status})`);
    return 0;
  },
};
