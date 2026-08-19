#!/usr/bin/env node
/**
 * ACCT-F5573 regression guard — POST /api/v1/banking/reconcile must verify the caller-supplied
 * obligation_id exists and belongs to the caller's company BEFORE writing it onto a real bank
 * transaction row.
 *
 * banking/obligation-reconcile.routes.ts previously wrote obligation_id straight onto
 * banking.bank_transactions.matched_load_id / matched_bill_id / matched_settlement_id /
 * linked_entity_id with zero existence or company-ownership check. Every downstream JOIN on those
 * columns is itself company-scoped (plaid/link.routes.ts, qbo-sync.service.ts), so a bogus/foreign
 * id doesn't leak another tenant's data through those reads -- but it DOES silently mark a real
 * transaction "matched" against nothing, permanently hiding a genuinely-unreconciled transaction
 * from the /unmatched-transactions queue (which filters on matched_* / reconciled_obligation_id
 * being NULL).
 *
 * Fix: an OBLIGATION_EXISTENCE_SQL lookup keyed by obligation_type, checked inside the same
 * transaction before the UPDATE, rolling back and returning "obligation_not_found" on a miss.
 *
 * This static check (no DB connection) asserts:
 *   1. OBLIGATION_EXISTENCE_SQL covers all 5 table-backed obligation types (load, settlement,
 *      fuel, work_order, ar_invoice, bill) with an operating_company_id predicate each.
 *   2. The POST /reconcile handler actually queries OBLIGATION_EXISTENCE_SQL and rolls back /
 *      returns "obligation_not_found" on a miss, before the UPDATE that writes matched_*.
 *   3. The reply mapping explicitly branches on "obligation_not_found" (not folded into the
 *      generic `!ok` falsy check, which would silently treat a non-empty string as truthy and
 *      fall through to `{ ok: true }`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:obligation-reconcile-existence-checked";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/banking/obligation-reconcile.routes.ts";

const TABLE_TYPES = ["load", "settlement", "fuel", "work_order", "ar_invoice", "bill"];

function assertAll(src) {
  const problems = [];

  for (const t of TABLE_TYPES) {
    const re = new RegExp(`${t}:\\s*\`SELECT 1 FROM [\\w.]+ WHERE id = \\$1::uuid AND operating_company_id = \\$2::uuid`);
    if (!re.test(src)) {
      problems.push(`OBLIGATION_EXISTENCE_SQL missing a company-scoped existence query for "${t}"`);
    }
  }

  if (!/const existsRes = await client\.query\(existenceSql, \[body\.data\.obligation_id, companyId\]\)/.test(src)) {
    problems.push(`POST /reconcile no longer queries OBLIGATION_EXISTENCE_SQL before writing matched_* columns`);
  }
  if (!/if \(!existsRes\.rows\[0\]\) \{\s*\n\s*await client\.query\("ROLLBACK"\);\s*\n\s*return "obligation_not_found" as const;/.test(src)) {
    problems.push(`POST /reconcile no longer rolls back + returns "obligation_not_found" on a missing obligation`);
  }
  if (!/if \(ok === "obligation_not_found"\) return reply\.code\(404\)\.send\(\{ error: "obligation_not_found" \}\);/.test(src)) {
    problems.push(`POST /reconcile reply mapping no longer branches explicitly on "obligation_not_found" (would silently fall through !ok as truthy)`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  // Plant defect 1: drop the explicit obligation_not_found reply branch (the truthiness trap this
  // guard exists to catch -- a non-empty string is truthy, so `!ok` alone would mis-route it).
  const planted1 = src.replace(
    /if \(ok === "obligation_not_found"\) return reply\.code\(404\)\.send\(\{ error: "obligation_not_found" \}\);\n\s*/,
    "",
  );
  if (planted1 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 1 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted1).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 1 (missing obligation_not_found reply branch) not caught`);
    process.exit(1);
  }

  // Plant defect 2: drop the existence check call itself (regress to trusting the caller).
  const planted2 = src.replace(
    /const existsRes = await client\.query\(existenceSql, \[body\.data\.obligation_id, companyId\]\);\s*\n\s*if \(!existsRes\.rows\[0\]\) \{\s*\n\s*await client\.query\("ROLLBACK"\);\s*\n\s*return "obligation_not_found" as const;\s*\n\s*\}\s*\n/,
    "",
  );
  if (planted2 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 2 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted2).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 2 (missing existence-check call) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
