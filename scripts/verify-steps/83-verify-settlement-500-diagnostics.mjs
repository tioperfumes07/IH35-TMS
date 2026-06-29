#!/usr/bin/env node
/**
 * CHAIN-07 guard: the settlement-payment 500 fall-through must surface the Postgres error
 * `pg_code` (and `pg_constraint`) so an unexpected settlement-payment failure is diagnosable
 * instead of an opaque envelope. It must NOT surface `detail` (can carry row data).
 * Regression guard for fix/settlements-500-observability-chain07.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(root, "apps/backend/src/driver-finance/settlement-payment.routes.ts");
const src = readFileSync(file, "utf8");

const errors = [];
if (!/error:\s*"settlement_payment_operation_failed"/.test(src)) {
  errors.push("settlement_payment_operation_failed 500 envelope not found");
}
if (!/pg_code/.test(src)) {
  errors.push("500 fall-through must surface `pg_code` (Postgres error code) for diagnosability");
}
if (!/pg_constraint/.test(src)) {
  errors.push("500 fall-through must surface `pg_constraint` (constraint name) for diagnosability");
}
// Safety: never leak the Postgres `detail` field (may contain row data) in the client response.
if (/\bdetail\b\s*:\s*err\??\.detail/.test(src) || /pg_detail/.test(src)) {
  errors.push("must NOT send the Postgres `detail` field to the client (row-data leak)");
}

if (errors.length) {
  console.error("verify-settlement-500-diagnostics FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-settlement-500-diagnostics — OK");
