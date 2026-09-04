#!/usr/bin/env node
/**
 * verify-liability-balance-syncs-at-settlement-close.mjs
 *
 * driver_finance.driver_liabilities is the GL-facing liability record created alongside a
 * driver_advances row at disbursement (cash-advance-create.ts createDriverCashAdvanceCore), but
 * closeSettlementPayRun's GO-22 B7 recovery loop only ever updated driver_advances.outstanding_balance
 * -- the sibling driver_liabilities row was never touched, staying frozen at its original balance
 * forever even after full recovery. This is what made CASH-ADV-F9930's paid_to_date-based reversal
 * guard blind to the real recovery path (a fully-recovered advance still showed paid_to_date=0).
 */
import { readFileSync } from "node:fs";

const SERVICE_PATH = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";

function loadSource() {
  return readFileSync(SERVICE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!/liability_id::text/.test(src)) {
    failures.push("loadRecoverableAdvances no longer selects liability_id");
  }
  if (!/SET current_balance = 0, paid_to_date = original_amount, updated_at = now\(\)/.test(src)) {
    failures.push("full-recovery branch does not zero out driver_liabilities.current_balance");
  }
  if (!/SET current_balance = \$2::numeric,\s*\n\s*paid_to_date = original_amount - \$2::numeric,/.test(src)) {
    failures.push("partial-recovery branch does not sync driver_liabilities to the remaining balance");
  }
  const fullIdx = src.indexOf("SET recovered_in_settlement_id = $2::uuid, status = 'recovered'");
  const fullSyncIdx = src.indexOf("SET current_balance = 0, paid_to_date = original_amount, updated_at = now()");
  if (fullIdx === -1 || fullSyncIdx === -1 || fullSyncIdx < fullIdx) {
    failures.push("liability full-sync does not run after the driver_advances full-recovery update");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-liability-balance-syncs-at-settlement-close SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    ["liability_id no longer selected", "liability_id::text", "'not-selected'"],
    [
      "full-recovery sync removed",
      "SET current_balance = 0, paid_to_date = original_amount, updated_at = now()",
      "SET current_balance = current_balance",
    ],
    [
      "partial-recovery sync removed",
      "SET current_balance = $2::numeric,\n                     paid_to_date = original_amount - $2::numeric,",
      "SET current_balance = current_balance,",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-liability-balance-syncs-at-settlement-close SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-liability-balance-syncs-at-settlement-close SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-liability-balance-syncs-at-settlement-close: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-liability-balance-syncs-at-settlement-close: OK — driver_liabilities.current_balance/paid_to_date sync with driver_advances.outstanding_balance on every settlement-close recovery, full or partial");
