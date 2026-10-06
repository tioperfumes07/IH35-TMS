#!/usr/bin/env node
/**
 * ROUND 313: a wrong load cancellation is undone ONLY through cancellation-reversal.service.ts (migration
 * 202615180900). Fails if: the service / route / trigger clearing branch disappear, or any other backend file or
 * ops script writes load_cancellations status 'reversed' or clears mdata.loads.canceled_at directly (the
 * ROUND-155.26 one-off that left 13625/13627/13638 stamped is exactly the shape this refuses).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_load_cancellation_reversal_canonical(); }
async function selftest_verify_load_cancellation_reversal_canonical() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_load_cancellation_reversal_canonical", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}

const fails = [];
const svc = "apps/backend/src/dispatch/cancellation-reversal.service.ts";
const s = readFileSync(svc, "utf8");
if (!/SET status = 'reversed'/.test(s)) fails.push(`${svc}: must mark the cancellation row 'reversed'`);
if (!/E_CANCEL_STAMP_NOT_CLEARED/.test(s)) fails.push(`${svc}: must refuse when the load keeps its cancel stamp`);
if (!/dispatch\.load\.cancellation_reversed/.test(s)) fails.push(`${svc}: must write the cancellation_reversed audit row`);
if (!/\/api\/v1\/dispatch\/loads\/:id\/cancellation\/reverse/.test(readFileSync("apps/backend/src/dispatch/cancellation.routes.ts", "utf8"))) fails.push("reverse route missing");
if (!/IF NEW\.status = 'reversed' THEN[\s\S]*canceled_at = NULL/.test(readFileSync("db/migrations/202615180900_load_cancellation_reversal.sql", "utf8"))) fails.push("trigger must clear canceled_at on reversal");

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|mts|mjs)$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
for (const p of [...walk("apps/backend/src"), ...walk("scripts/ops")]) {
  if (p.endsWith("cancellation-reversal.service.ts")) continue;
  const t = readFileSync(p, "utf8");
  if (/load_cancellations[\s\S]{0,200}status\s*=\s*'reversed'/.test(t)) fails.push(`${p}: writes status 'reversed' outside the canonical service`);
  if (/UPDATE\s+mdata\.loads[\s\S]{0,200}canceled_at\s*=\s*NULL/i.test(t)) fails.push(`${p}: clears mdata.loads.canceled_at directly`);
}
if (fails.length) { console.error("verify-load-cancellation-reversal-canonical: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-load-cancellation-reversal-canonical: OK");
