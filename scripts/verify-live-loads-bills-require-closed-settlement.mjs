#!/usr/bin/env node
/**
 * ROUND 285 — views.live_loads driver_bills half must require closed settlement,
 * matching canonicalActiveLoadNotFinishedByMoneyCte (Lead #23294 + this migration).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";

const ROOT = process.env.VERIFY_ROOT || fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-live-loads-bills-require-closed-settlement";

if (process.argv.includes("--selftest")) selftest();

function mustContain(rel, needles) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`${LABEL} FAIL: missing ${rel}`);
    process.exit(1);
  }
  const src = readFileSync(abs, "utf8");
  for (const n of needles) {
    if (!src.includes(n)) {
      console.error(`${LABEL} FAIL: ${rel} missing ${JSON.stringify(n)}`);
      process.exit(1);
    }
  }
  return src;
}

const mig = "db/migrations/202614661200_live_loads_driver_bills_require_closed_settlement.sql";
const ts = "apps/backend/src/dispatch/canonical-active-load-set.ts";

const migSrc = mustContain(mig, [
  "CREATE VIEW views.live_loads",
  "security_invoker = true",
  "ds2.status = 'closed'",
  "b.settled_in_settlement_id",
  "b.status <> 'void'",
]);

// Ban the old lone-pointer predicate in THIS migration (the fixed join must be present).
if (/FROM driver_finance\.driver_bills b\s+WHERE b\.load_id = l\.id AND b\.settled_in_settlement_id IS NOT NULL/.test(migSrc)) {
  console.error(`${LABEL} FAIL: ${mig} still has the old bills-only settled_in_settlement_id gate`);
  process.exit(1);
}

mustContain(ts, [
  "canonicalActiveLoadNotFinishedByMoneyCte",
  "ds2.status = 'closed'",
  "settled_in_settlement_id",
]);

console.log(`${LABEL} OK`);
process.exit(0);

function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {}, [], { VERIFY_ROOT: "." });
  reportSelftest(LABEL, [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when core inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
