#!/usr/bin/env node
/**
 * SETL-HEADER-05 — static-shape guard.
 *
 * owner work order 2026-08-30, Task 5: the LIVE settlement poster (settlement-bill-payment-
 * posting.service.ts) wrote accounting_bill_id / accounting_bill_payment_id into the per-bill child
 * table (driver_finance.driver_settlement_gl_bills) but never back onto the settlement header
 * (driver_finance.driver_settlements) itself. The only historical writer of the header columns was
 * payroll/driver-settlement.service.deprecated.ts, a RETIRE-lane writer against a DIFFERENT table
 * (payroll.driver_settlements) — so the canonical header was NEVER linked, which made
 * transaction-health.service.ts's (s.accounting_bill_id IS NOT NULL) signal score every settlement
 * as unlinked even when the money posted correctly. This defect made THREE separate seats
 * misdiagnose the settlement module as dead.
 *
 * This guard is source-shape only (no DB) — it asserts the header UPDATE exists, runs inside the
 * same transaction as the run-finalize step, and is never reverted to a no-op.
 */
import { readFileSync } from "node:fs";

const POSTER_FILE = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

function analyze(src) {
  const failures = [];

  if (!/let headerAccountingBillId: string \| null = null;/.test(src)) {
    failures.push(`${POSTER_FILE}: headerAccountingBillId capture variable is missing`);
  }
  if (!/UPDATE driver_finance\.driver_settlements\s*\n\s*SET accounting_bill_id = COALESCE\(accounting_bill_id, \$2::uuid\),\s*\n\s*accounting_bill_payment_id = COALESCE\(accounting_bill_payment_id, \$3::uuid\)/.test(
      src
    )
  ) {
    failures.push(`${POSTER_FILE}: settlement header back-link UPDATE is missing or reshaped`);
  }
  // The header UPDATE must sit inside the same scoped(...) block as the run-finalize UPDATE, not a
  // separate best-effort call after the transaction closes (that would reopen the exact "engine
  // posts, header stays stale if the process dies between the two" risk this whole finding is about).
  const finalizeIdx = src.indexOf("Finalize the run + immutable audit");
  const headerIdx = src.indexOf("SETL-HEADER-05 — the missing header back-link");
  const nextScopedCloseIdx = src.indexOf("await appendCrudAudit(", finalizeIdx);
  if (finalizeIdx === -1 || headerIdx === -1 || headerIdx < finalizeIdx || headerIdx > nextScopedCloseIdx) {
    failures.push(`${POSTER_FILE}: header back-link write is not inside the run-finalize scoped(...) transaction`);
  }

  return failures;
}

function readAll() {
  return { src: readFileSync(POSTER_FILE, "utf8") };
}

function selftest() {
  const { src } = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-settlement-header-backlink-written --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "header UPDATE removed entirely",
      apply: (s) =>
        s.replace(
          /\s*\/\/ SETL-HEADER-05 — the missing header back-link[\s\S]*?\n {4}\}\n/,
          "\n"
        ),
    },
    {
      name: "capture variable removed",
      apply: (s) => s.replace("let headerAccountingBillId: string | null = null;\n  let headerCashBillPaymentId: string | null = null;\n\n  ", ""),
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const mutated = mut.apply(src);
    if (mutated === src) {
      console.error(`verify-settlement-header-backlink-written --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-settlement-header-backlink-written --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { src } = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-settlement-header-backlink-written: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-settlement-header-backlink-written: OK -- header back-link written inside the run-finalize transaction");
}
