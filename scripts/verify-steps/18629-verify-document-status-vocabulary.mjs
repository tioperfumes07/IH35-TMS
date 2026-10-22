#!/usr/bin/env node
/**
 * LEAD 443.219 G-VOCAB (CC-1 claim 18629) — ONE status vocabulary per document type, matching the live database.
 * Static check: backend module and shared-types twin list the same values; every fixed site reads the module.
 * Live check (fail closed, read-only, USMCA): driver_bills' CHECK members = DRIVER_BILL_STATUSES;
 * every live accounting.bills status is a member of AP_BILL_STATUSES ∪ AP_BILL_LEGACY_STATUSES.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-document-status-vocabulary.mjs");

export default {
  name: "verify-document-status-vocabulary",
  run() {
    const r = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-document-status-vocabulary --selftest failed (exit ${r.status})`);
    return 0;
  },
};
