#!/usr/bin/env node
/**
 * PINGSETTLEMENT-CLOSE-NO-OPEN-SETTLEMENT-FALLBACK — live-proven 2026-08-31 on load 13512.
 *
 * closeLoadBookendedSettlementForDriver decides which settlement gets a load's real
 * settlement_lines attached when the driver's trip ends (delivered_pending_docs). Before this
 * fix, when no genuinely-open settlement existed for the driver (busy=0 — this IS their last
 * active load), it silently `return 0`'d: revenue was already recognized (latchOnDeliveryEvidence
 * fires from the same call site) but the driver's pay for that load vanished — no settlement, no
 * settlement_lines, nothing for anyone to query. This can happen for reasons that have nothing to
 * do with a code bug (an in_transit OPEN event straddling a deploy is the live-proven case, but
 * any path that reaches delivered_pending_docs without a prior open event hits the same gap).
 *
 * FIX: when no open settlement is found AND the driver has no other active loads (busy=0), fall
 * back to opening a fresh settlement anchored to THIS load via openLoadBookendedSettlement (the
 * SAME function the in_transit path calls — inherits its driver/load-match and reuse guarantees,
 * so this can never attach to the wrong driver or a dead load), then close it immediately.
 *
 * This guard is source-shape only (verify:static has no DB). It asserts the fallback branch calls
 * openLoadBookendedSettlement (not a bespoke INSERT) exactly when settlementId is still empty
 * after the primary lookup, and that the final `if (!settlementId) return 0;` guard remains (so a
 * load with no assigned driver, or any other true failure, still fails closed rather than
 * fabricating a settlement).
 *
 * Run: node scripts/verify-settlement-close-fallback-opens-if-missing.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const LABEL = "verify-settlement-close-fallback-opens-if-missing";

function closeFn(src) {
  const start = src.indexOf("async function closeLoadBookendedSettlementForDriver");
  if (start === -1) return null;
  const nextFn = src.indexOf("\nasync function ", start + 1);
  const nextExport = src.indexOf("\nexport async function ", start + 1);
  const boundaries = [nextFn, nextExport].filter((n) => n !== -1);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : undefined;
  return src.slice(start, end);
}

export function collectProblems(src) {
  const problems = [];
  const fn = closeFn(src);
  if (!fn) {
    problems.push(`${FILE}: closeLoadBookendedSettlementForDriver not found — an unparsed close path must not read as a pass.`);
    return problems;
  }
  if (!/let settlementId\s*=\s*openRes\.rows\[0\]\?\.id/.test(fn)) {
    problems.push(`${FILE}: settlementId lookup must be reassignable (let, not const) for the fallback to attach to it.`);
  }
  if (!/if\s*\(\s*!settlementId\s*\)\s*\{[\s\S]{0,400}openLoadBookendedSettlement\(/.test(fn)) {
    problems.push(
      `${FILE}: no fallback found — when the primary open-settlement lookup returns empty, this must call ` +
        `openLoadBookendedSettlement (the same function the in_transit path uses) rather than silently return 0. ` +
        `A load reaching its terminal delivery status must never lose its driver pay silently ` +
        `(PINGSETTLEMENT-CLOSE-NO-OPEN-SETTLEMENT-FALLBACK).`
    );
  }
  if (!/if\s*\(\s*!settlementId\s*\)\s*return\s*0\s*;/.test(fn)) {
    problems.push(
      `${FILE}: the final "if (!settlementId) return 0;" fail-closed guard is missing — a genuine failure ` +
        `(no assigned driver, load not found) must still no-op, not fabricate a settlement.`
    );
  }
  // The fallback must reuse the real function, not a bespoke INSERT — money-theater guard.
  if (/if\s*\(\s*!settlementId\s*\)\s*\{[\s\S]{0,400}INSERT INTO driver_finance\.driver_settlements/.test(fn)) {
    problems.push(`${FILE}: fallback must call openLoadBookendedSettlement, not a bespoke INSERT — reuse the canonical writer.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");

  const live = collectProblems(real);
  if (live.length) {
    failures.push(`live source should pass, got: ${live.join(" | ")}`);
  }

  // Mutation 1: revert to the old silent no-op (drop the fallback block entirely).
  const fn = closeFn(real);
  const fallbackBlockRe = /\n\s*if\s*\(\s*!settlementId\s*\)\s*\{[\s\S]*?\n\s*\}\n(\s*if\s*\(\s*!settlementId\s*\)\s*return 0;)/;
  const m = fallbackBlockRe.exec(fn);
  if (!m) {
    failures.push("mutation 1 setup failed: fallback block anchor not found in live source");
  } else {
    const mutatedFn = fn.replace(fallbackBlockRe, `\n${m[1]}`);
    const mutatedSrc = real.replace(fn, mutatedFn);
    if (mutatedSrc === real) {
      failures.push("mutation 1 setup failed: replace did not change source");
    } else if (collectProblems(mutatedSrc).length === 0) {
      failures.push("mutation 1 (fallback removed, reverted to silent no-op) was NOT caught");
    }
  }

  // Mutation 2: fallback present but calls a bespoke INSERT instead of the canonical function.
  if (m) {
    const mutatedFn2 = fn.replace(
      "openLoadBookendedSettlement(client, {",
      "client.query(`INSERT INTO driver_finance.driver_settlements (operating_company_id) VALUES ($1)`, [opts.operatingCompanyId]); const opened = { settlementId: '' }; ({"
    );
    if (mutatedFn2 === fn) {
      failures.push("mutation 2 setup failed: anchor not found");
    } else {
      const mutatedSrc2 = real.replace(fn, mutatedFn2);
      if (collectProblems(mutatedSrc2).length === 0) {
        failures.push("mutation 2 (fallback swapped for a bespoke INSERT) was NOT caught");
      }
    }
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — live source passes, silent-no-op regression caught, bespoke-INSERT regression caught`);
  process.exit(0);
}

const problems = collectProblems(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — closeLoadBookendedSettlementForDriver self-heals via the canonical opener instead of silently dropping a load's driver pay.`);
