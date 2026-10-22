#!/usr/bin/env node
/**
 * LEAD 443.210R G2 (CC-1 claim 18649) — ONE MONEY READ MODEL: loadCostRollupLateral is the SINGLE
 * per-load cost/revenue source; all money surfaces agree; alias `cl` not `l` (ACCT-F2026092587).
 *
 * STATIC (no DB): RULE1 all surfaces use loadCostRollupLateral, RULE2 no rate_total_cents as revenue,
 * RULE3 alias is `cl` not `l`. LIVE (requires DATABASE_URL): RULE4 rollup revenue matches raw invoice
 * total for all invoiced USMCA loads.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-money-surfaces-agree.mjs");

export default {
  name: "verify-money-surfaces-agree",
  run() {
    // Static selftest — no DB required
    const selftest = spawnSync(process.execPath, [GUARD, "--selftest"], { cwd: ROOT, stdio: "inherit" });
    if (selftest.status !== 0) throw new Error(`verify-money-surfaces-agree --selftest failed (exit ${selftest.status})`);

    // Live run — fail-closed if DATABASE_URL absent (per require-live-db.mjs law)
    const live = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (live.status !== 0) throw new Error(`verify-money-surfaces-agree failed (exit ${live.status})`);

    return 0;
  },
};
