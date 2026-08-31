#!/usr/bin/env node
/**
 * FACTORING-RATE-MISMATCH — createDraftBatch must prefer resolved factor advance_rate/fee_rate
 * over hardcoded 0.95/0.025 when deps omit rates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/factoring/batch.service.ts");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function check(src, label) {
  const fn = src.indexOf("export async function createDraftBatch");
  if (fn < 0) return `${label}: createDraftBatch missing`;
  const slice = src.slice(fn, fn + 9000);
  if (!/deps\.advanceRate\s*\?\?\s*factorPairs\[0\]\?\.advance_rate/.test(slice)) {
    return `${label}: must use factorPairs[0]?.advance_rate before hardcoded default`;
  }
  if (!/deps\.feeRate\s*\?\?\s*factorPairs\[0\]\?\.fee_rate/.test(slice)) {
    return `${label}: must use factorPairs[0]?.fee_rate before hardcoded default`;
  }
  if (!/advance_rate:\s*factor\s*!=\s*null\s*\?\s*toNumber\(factor\.advance_rate\)/.test(slice)) {
    return `${label}: must capture factor.advance_rate into customerResolution`;
  }
  return null;
}

function selftest() {
  const good = `
export async function createDraftBatch() {
  customerResolution.set(customerId, {
    factor_id: factor?.id ?? null,
    factor_name: factor?.name ?? null,
    advance_rate: factor != null ? toNumber(factor.advance_rate) : null,
    fee_rate: factor != null ? toNumber(factor.fee_rate) : null,
  });
  const advanceRate = deps.advanceRate ?? factorPairs[0]?.advance_rate ?? 0.95;
  const feeRate = deps.feeRate ?? factorPairs[0]?.fee_rate ?? 0.025;
}
`;
  const bad = `
export async function createDraftBatch() {
  customerResolution.set(customerId, {
    factor_id: factor?.id ?? null,
    factor_name: factor?.name ?? null,
  });
  const advanceRate = deps.advanceRate ?? 0.95;
  const feeRate = deps.feeRate ?? 0.025;
}
`;
  if (!check(bad, "planted-bad")) fail("selftest: planted-bad must FAIL");
  const g = check(good, "good");
  if (g) fail(`selftest: planted-good must PASS (${g})`);
  console.log("verify-factoring-batch-uses-factor-rates --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}
const err = check(fs.readFileSync(TARGET, "utf8"), TARGET);
if (err) fail(err);
console.log("verify-factoring-batch-uses-factor-rates PASS");
