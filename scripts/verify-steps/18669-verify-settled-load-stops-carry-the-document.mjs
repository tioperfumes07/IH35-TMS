#!/usr/bin/env node
/**
 * CC-3 claim 18669 — LEAD 443.241: every stop of a USMCA load on a signed settlement carries the document's facility + ZIP and a
 * real-address location fence. Static + LIVE (USMCA, read-only). See scripts/verify-settled-load-stops-carry-the-document.mjs.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-settled-load-stops-carry-the-document.mjs");

export default {
  name: "verify-settled-load-stops-carry-the-document",
  run() {
    const selftest = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (selftest.status !== 0) throw new Error(`verify-settled-load-stops-carry-the-document --selftest failed (exit ${selftest.status})`);
    const live = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (live.status !== 0) throw new Error(`verify-settled-load-stops-carry-the-document failed (exit ${live.status})`);
    return 0;
  },
};
