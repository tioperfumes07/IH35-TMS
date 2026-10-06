#!/usr/bin/env node
/**
 * ROUND 315: the delivery latch must never post on a second connection while the caller holds an open
 * transaction (measured: ~5 min idle-in-transaction lock on load 13626, then the poster committed anyway).
 * Fails if the open-transaction refusal or the transition path's lock/idle timeouts disappear.
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--selftest")) selftest();

const latch = readFileSync("apps/backend/src/dispatch/delivery-evidence-latch.ts", "utf8");
const tx = readFileSync("apps/backend/src/dispatch/load-transition.service.ts", "utf8");
const checks = [
  [/async function callerHoldsOpenTransaction\(/.test(latch) && /now\(\) <> statement_timestamp\(\)/.test(latch), "latch detects an open caller transaction"],
  [/if \(await callerHoldsOpenTransaction\(client\)\) \{\s*throw new Error\(\s*"E_LATCH_OUTSIDE_AFTER_COMMIT_SCOPE/.test(latch), "latch refuses inline posting inside an open transaction"],
  [latch.indexOf("callerHoldsOpenTransaction(client)") < latch.indexOf("await firePostLoadRevenueLatch(input);\n  await fireFactoringAutoSubmit"), "refusal comes before the inline poster"],
  [/SET LOCAL lock_timeout = '10s'/.test(tx) && /SET LOCAL idle_in_transaction_session_timeout = '60s'/.test(tx), "transition path bounds lock wait + idle time"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-delivery-latch-never-inline-in-open-tx: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-delivery-latch-never-inline-in-open-tx: OK (${checks.length})`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-delivery-latch-never-inline-in-open-tx", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
