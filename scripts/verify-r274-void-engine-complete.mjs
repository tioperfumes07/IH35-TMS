#!/usr/bin/env node
/**
 * ROUND 274 — void engine completeness + voided_at/status agreement (shrink-only).
 *
 * Fails when:
 *   1. A required R274 entity_type is missing from EXECUTORS as a wired function
 *      (or is still `{ supported: false }`).
 *   2. Live USMCA rows have voided_at set but status disagrees with that table's void status
 *      (ratchet: count must never grow; start baseline measured at guard authoring).
 *   3. Live USMCA reconciliation_matches still point at a voided bank_transaction that was
 *      merged into another row (Plaid pending→posted orphan class — item 53).
 *
 * REQUIRES_LIVE_DB. No wall-clock in the verdict.
 */
import { register } from "tsx/esm/api";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRES_LIVE_DB =
  "void engine completeness + voided_at/status agreement is a live-data invariant; cannot connect = FAIL, never a silent pass";

register();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-r274-void-engine-complete";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const EXECUTORS_FILE = path.join(ROOT, "apps/backend/src/governance/void-cancel-executors.ts");

/** Every R274 voidable entity must have a wired executeVoidCancel case (function, not supported:false). */
const REQUIRED_ENTITY_TYPES = [
  "expense",
  "reconciliation_match",
  "bank_transaction",
  "fuel_transaction",
  "relay_fuel_transaction",
  "relay_fuel_transaction_line",
  "factoring_advance",
  "bill_line",
  "invoice",
  "settlement_line",
  "check_number_registry",
  "driver_settlement",
  "bill",
  "driver_liability",
  "driver_bill",
  "safety_incident",
  "work_order",
  "legal_contract_instance",
];

/**
 * Shrink-only baselines (USMCA, measured at authoring after AUTH-132 factoring repair).
 * A growth is a FAIL. A shrink is a PASS that the next author ratchets down.
 */
const STATUS_DRIFT_BASELINE = 0;
const PLAID_ORPHAN_MATCH_BASELINE = 0; // measured 0 live after re-point (match 2d1f3f73… now on survivor 52c51c10…)

function assertExecutorsWired() {
  const src = fs.readFileSync(EXECUTORS_FILE, "utf8");
  const mapMatch = src.match(/const EXECUTORS[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
  if (!mapMatch) throw new Error(`${LABEL}: EXECUTORS map not found in void-cancel-executors.ts`);
  const mapBody = mapMatch[1];
  const missing = [];
  for (const key of REQUIRED_ENTITY_TYPES) {
    const re = new RegExp(`\\b${key}\\s*:\\s*([^,\\n]+)`);
    const m = mapBody.match(re);
    if (!m) {
      missing.push(`${key} (absent)`);
      continue;
    }
    const val = m[1].trim();
    if (val.includes("supported: false") || val.includes("supported:false")) {
      missing.push(`${key} (supported:false)`);
    }
  }
  return missing;
}

async function selftest() {
  const failures = [];
  const missing = assertExecutorsWired();
  if (missing.length) failures.push(`static wiring: ${missing.join(", ")}`);
  if (!Number.isInteger(STATUS_DRIFT_BASELINE) || STATUS_DRIFT_BASELINE < 0) {
    failures.push("STATUS_DRIFT_BASELINE must be non-negative int");
  }
  if (!Number.isInteger(PLAID_ORPHAN_MATCH_BASELINE) || PLAID_ORPHAN_MATCH_BASELINE < 0) {
    failures.push("PLAID_ORPHAN_MATCH_BASELINE must be non-negative int");
  }
  // Source must call the Plaid match re-point helper (item 53 merge-path fix).
  const dedup = fs.readFileSync(path.join(ROOT, "apps/backend/src/banking/bank-tx-dedup.ts"), "utf8");
  if (!dedup.includes("repointReconciliationMatchesOnPlaidMerge")) {
    failures.push("bank-tx-dedup.ts missing repointReconciliationMatchesOnPlaidMerge");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${REQUIRED_ENTITY_TYPES.length} entity types wired; plaid re-point present`);
}

async function live() {
  const { withLuciaBypass } = await import("../apps/backend/src/auth/db.ts");
  const missing = assertExecutorsWired();
  if (missing.length) {
    console.error(`${LABEL}: FAIL — executeVoidCancel missing wired cases:\n  - ${missing.join("\n  - ")}`);
    process.exit(1);
  }

  const drift = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const q = await client.query(`
      SELECT 'factoring_advances' AS t, count(*)::int AS n
        FROM accounting.factoring_advances
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'voided'
      UNION ALL
      SELECT 'expenses', count(*)::int
        FROM accounting.expenses
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'void'
      UNION ALL
      SELECT 'invoices', count(*)::int
        FROM accounting.invoices
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'void'
      UNION ALL
      SELECT 'driver_bills', count(*)::int
        FROM driver_finance.driver_bills
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'void'
      UNION ALL
      SELECT 'driver_liabilities', count(*)::int
        FROM driver_finance.driver_liabilities
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'voided'
      UNION ALL
      SELECT 'driver_settlements', count(*)::int
        FROM driver_finance.driver_settlements
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
      UNION ALL
      SELECT 'check_number_registry', count(*)::int
        FROM banking.check_number_registry
       WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND status IS DISTINCT FROM 'voided'
    `, [USMCA]);
    return q.rows;
  });

  const driftTotal = drift.reduce((s, r) => s + Number(r.n), 0);
  if (driftTotal > STATUS_DRIFT_BASELINE) {
    console.error(`${LABEL}: FAIL — voided_at/status drift GREW to ${driftTotal} (baseline ${STATUS_DRIFT_BASELINE}):`);
    for (const r of drift) if (Number(r.n) > 0) console.error(`  ✗ ${r.t}=${r.n}`);
    process.exit(1);
  }

  const orphan = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const q = await client.query(
      `SELECT count(*)::int AS n
         FROM banking.reconciliation_matches rm
         JOIN banking.bank_transactions bt ON bt.id = rm.bank_transaction_id
        WHERE bt.operating_company_id = $1::uuid
          AND bt.voided_at IS NOT NULL
          AND bt.merged_into_bank_transaction_id IS NOT NULL
          AND rm.voided_at IS NULL`,
      [USMCA]
    );
    return Number(q.rows[0]?.n ?? 0);
  });

  if (orphan > PLAID_ORPHAN_MATCH_BASELINE) {
    console.error(
      `${LABEL}: FAIL — Plaid-merge orphan matches GREW to ${orphan} (baseline ${PLAID_ORPHAN_MATCH_BASELINE})`
    );
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — ${REQUIRED_ENTITY_TYPES.length} entities wired; status_drift=${driftTotal}/${STATUS_DRIFT_BASELINE}; plaid_orphans=${orphan}/${PLAID_ORPHAN_MATCH_BASELINE}`
  );
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  await selftest();
} else {
  await live();
}
