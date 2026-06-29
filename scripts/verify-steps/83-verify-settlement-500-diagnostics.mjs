import fs from "node:fs";
import path from "node:path";

/**
 * CHAIN-07 guard: the settlement-payment 500 fall-through must surface the Postgres error
 * `pg_code` (and `pg_constraint`) so an unexpected settlement-payment failure is diagnosable
 * instead of an opaque envelope. It must NOT surface `detail` (can carry row data).
 * Regression guard for fix/settlements-500-observability-chain07.
 */
const ROUTES = "apps/backend/src/driver-finance/settlement-payment.routes.ts";

export default {
  name: "verify-settlement-500-diagnostics",
  run: () => {
    const abs = path.resolve(ROUTES);
    if (!fs.existsSync(abs)) {
      console.error(`verify-settlement-500-diagnostics FAILED — missing ${ROUTES}`);
      process.exit(1);
    }
    const src = fs.readFileSync(abs, "utf8");
    const fails = [];
    if (!/error:\s*"settlement_payment_operation_failed"/.test(src)) {
      fails.push("settlement_payment_operation_failed 500 envelope not found");
    }
    if (!/pg_code/.test(src)) {
      fails.push("500 fall-through must surface `pg_code` (Postgres error code) for diagnosability");
    }
    if (!/pg_constraint/.test(src)) {
      fails.push("500 fall-through must surface `pg_constraint` (constraint name) for diagnosability");
    }
    // Safety: never leak the Postgres `detail` field (may contain row data) in the client response.
    if (/pg_detail/.test(src) || /\bdetail\b\s*:\s*err\??\.detail/.test(src)) {
      fails.push("must NOT send the Postgres `detail` field to the client (row-data leak)");
    }
    if (fails.length) {
      console.error("verify-settlement-500-diagnostics FAILED:");
      for (const f of fails) console.error("  - " + f);
      process.exit(1);
    }
    console.log("verify-settlement-500-diagnostics OK — pg_code/pg_constraint surfaced, detail withheld.");
  },
};
