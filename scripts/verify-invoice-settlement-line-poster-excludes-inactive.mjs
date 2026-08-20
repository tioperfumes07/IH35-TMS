#!/usr/bin/env node
/**
 * ACCT-F5655 — two GL posters read a soft-delete-able money-line table without the exclusion
 * predicate ACCT-F156 already established as canonical for that table:
 *
 * (1) posting-engine.service.ts's invoice→GL poster (buildInvoiceLines) SELECTs
 *     accounting.invoice_lines.line_total_cents and sums it in JavaScript
 *     (`revenueTotal += lineCents`) — no SQL SUM() at all, so ACCT-F156's own
 *     verify-money-line-sums-exclude-voided.mjs (which only scans for SUM(...) shapes) cannot see
 *     it. recomputeInvoiceTotals (shared.ts) already excludes soft-deleted lines from
 *     invoices.total_cents; this poster read the same table without that filter, so a line removed
 *     from a draft invoice before it was sent/posted would still be booked to revenue and A/R,
 *     permanently overstating both by the removed line's amount (the JE is internally balanced, so
 *     assertBalanced and the DB trigger both pass — nothing else catches the divergence from the
 *     invoice's own total).
 *
 * (2) settlement-bill-payment-posting.service.ts's loadDriverBills pulls driver bills through an
 *     `IN (SELECT sl.source_driver_bill_id FROM driver_finance.settlement_lines ...)` subquery with
 *     no `is_active = true` filter — the residual instance ACCT-F156's own fix (applied to 3 sibling
 *     files) missed, in the one file that actually creates the driver's A/P bill and its GL.
 *
 * Both are dedicated, narrow assertions (not a generalized column-name scan — an earlier attempt at
 * that produced 52 false positives across INSERT/RETURNING/non-aggregating reads, exactly the
 * "wrong two times in three" trap ACCT-F156's own guard header warns against). This guard checks
 * only these two specific, already-fixed call sites.
 *
 * Run:  node scripts/verify-invoice-settlement-line-poster-excludes-inactive.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-settlement-line-poster-excludes-inactive";

const POSTING_ENGINE_FILE = "apps/backend/src/accounting/posting-engine.service.ts";
const SETTLEMENT_BILL_PAYMENT_FILE = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

export function analyzePostingEngineSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const fromIdx = code.indexOf("FROM accounting.invoice_lines il");
  if (fromIdx < 0) {
    failures.push(`${POSTING_ENGINE_FILE}: could not locate the invoice_lines SELECT in buildInvoiceLines`);
    return failures;
  }
  const whereIdx = code.indexOf("WHERE il.invoice_id", fromIdx);
  const orderIdx = code.indexOf("ORDER BY il.display_order", fromIdx);
  if (whereIdx < 0 || orderIdx < 0 || orderIdx < whereIdx) {
    failures.push(`${POSTING_ENGINE_FILE}: could not locate the WHERE...ORDER BY bounds of the invoice_lines SELECT`);
    return failures;
  }
  const whereClause = code.slice(whereIdx, orderIdx);
  if (!/il\.soft_deleted_at\s+IS\s+NULL/.test(whereClause)) {
    failures.push(
      `${POSTING_ENGINE_FILE}: buildInvoiceLines' invoice_lines SELECT must filter ` +
        `il.soft_deleted_at IS NULL — omitting it books revenue/A/R for a line the invoice's own ` +
        `total already excludes (ACCT-F5655).`
    );
  }
  return failures;
}

export function analyzeSettlementBillPaymentSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const subqueryMatch = code.match(/SELECT\s+sl\.source_driver_bill_id[\s\S]{0,900}?\)/);
  if (!subqueryMatch) {
    failures.push(`${SETTLEMENT_BILL_PAYMENT_FILE}: could not locate the settlement_lines source_driver_bill_id subquery in loadDriverBills`);
    return failures;
  }
  if (!/sl\.is_active\s*=\s*true/.test(subqueryMatch[0])) {
    failures.push(
      `${SETTLEMENT_BILL_PAYMENT_FILE}: loadDriverBills' settlement_lines subquery must filter ` +
        `sl.is_active = true — omitting it would pull a deactivated settlement line's driver bill ` +
        `into the A/P bill + GL this poster creates (ACCT-F5655).`
    );
  }
  return failures;
}

export function run() {
  const postingEngine = fs.readFileSync(path.join(ROOT, POSTING_ENGINE_FILE), "utf8");
  const settlementBillPayment = fs.readFileSync(path.join(ROOT, SETTLEMENT_BILL_PAYMENT_FILE), "utf8");
  return [...analyzePostingEngineSource(postingEngine), ...analyzeSettlementBillPaymentSource(settlementBillPayment)];
}

if (process.argv.includes("--selftest")) {
  const GOOD_POSTING_ENGINE = `
async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
  const lineRows = await client.query(
    \`
      SELECT il.id::text AS id, il.line_total_cents::bigint AS line_total_cents
      FROM accounting.invoice_lines il
      WHERE il.invoice_id = $1::uuid
        AND il.soft_deleted_at IS NULL
      ORDER BY il.display_order ASC, il.id ASC
    \`,
    [sourceId, operatingCompanyId]
  );
}
`;
  const goodPEFailures = analyzePostingEngineSource(GOOD_POSTING_ENGINE);
  if (goodPEFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (posting-engine) FAILED: ${goodPEFailures.join("; ")}`);
  }

  const BAD_POSTING_ENGINE = `
async function buildInvoiceLines(client, operatingCompanyId, sourceId) {
  const lineRows = await client.query(
    \`
      SELECT il.id::text AS id, il.line_total_cents::bigint AS line_total_cents
      FROM accounting.invoice_lines il
      WHERE il.invoice_id = $1::uuid
      ORDER BY il.display_order ASC, il.id ASC
    \`,
    [sourceId, operatingCompanyId]
  );
}
`;
  if (!analyzePostingEngineSource(BAD_POSTING_ENGINE).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (posting-engine, no soft_deleted_at filter) should FAIL but passed`);
  }

  const GOOD_SETTLEMENT = `
async function loadDriverBills(client, operatingCompanyId, settlementId, driverId) {
  const res = await client.query(
    \`
      SELECT db.id::text
      FROM driver_finance.driver_bills db
      WHERE db.operating_company_id = $1::uuid
        AND (
          db.settled_in_settlement_id = $2::uuid
          OR db.id IN (
            SELECT sl.source_driver_bill_id
            FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id = $2::uuid AND sl.source_driver_bill_id IS NOT NULL
              AND sl.is_active = true
          )
        )
    \`,
    [operatingCompanyId, settlementId, driverId]
  );
}
`;
  const goodSettlementFailures = analyzeSettlementBillPaymentSource(GOOD_SETTLEMENT);
  if (goodSettlementFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (settlement) FAILED: ${goodSettlementFailures.join("; ")}`);
  }

  const BAD_SETTLEMENT = `
async function loadDriverBills(client, operatingCompanyId, settlementId, driverId) {
  const res = await client.query(
    \`
      SELECT db.id::text
      FROM driver_finance.driver_bills db
      WHERE db.operating_company_id = $1::uuid
        AND (
          db.settled_in_settlement_id = $2::uuid
          OR db.id IN (
            SELECT sl.source_driver_bill_id
            FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id = $2::uuid AND sl.source_driver_bill_id IS NOT NULL
          )
        )
    \`,
    [operatingCompanyId, settlementId, driverId]
  );
}
`;
  if (!analyzeSettlementBillPaymentSource(BAD_SETTLEMENT).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (settlement, no is_active filter) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly for both call sites`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the invoice-lines poster and the settlement-bill-payment poster both exclude soft-deleted/inactive lines`);
