#!/usr/bin/env node
/**
 * verify-acct-f9408-cash-forecast-proforma-eta-bucket.mjs
 *
 * ACCT-F9408-CASH-FORECAST-PROFORMA-STALE-DELIVERY-DATE-BUCKET — the 13-week
 * /accounting/cash-forecast page's "Proforma / Pre-invoice" column bucketed each proforma
 * invoice by the load's RAW delivery-stop date instead of the same ETA-adjusted
 * projected_cash_date /cash-flow already uses (cash-flow.service.ts's getDailyPrediction /
 * proformaSql, gated on CASH_FOLLOWS_ETA_ENABLED via projectedCashDateSql(...)). Any invoice
 * whose raw delivery date had already elapsed by the time its net-terms/factoring-adjusted
 * cash date arrived was silently excluded from every visible week's figure and the running
 * projected balance, with no error and no honest-empty-state disclosure — live-verified on
 * invoice INV-2026-00035 / load L-20260811-0026 (2026-08-13 raw date -> 2026-09-12 real
 * projected cash date, $1,000.00 dropped from every week in the old query, correctly bucketed
 * onto 2026-09-12 in the fixed one).
 *
 * Guards against the proforma query in cash-forecast.routes.ts reverting to the raw
 * fd.scheduled_arrival_at bucket date, or dropping the CASH_FOLLOWS_ETA_ENABLED gate / the
 * shared projectedCashDateSql import — the fix must keep reusing that one helper, never
 * reintroduce its date math inline.
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/accounting/cash-forecast.routes.ts";
const src = readFileSync(routesPath, "utf8");

const failures = [];

if (!/import\s*\{\s*projectedCashDateSql\s*\}\s*from\s*"\.\.\/cash-flow\/projected-cash-date\.js"/.test(src)) {
  failures.push(`${routesPath}: no longer imports the shared projectedCashDateSql helper from cash-flow/projected-cash-date.js — do not reintroduce date math inline`);
}

if (!/isEnabled\(client,\s*"CASH_FOLLOWS_ETA_ENABLED"/.test(src)) {
  failures.push(`${routesPath}: cash-forecast route no longer checks the CASH_FOLLOWS_ETA_ENABLED flag before bucketing proforma invoices`);
}

// The proforma subquery's bucket_date must branch through projectedCashDateSql when the flag is
// on, and its outer filter must key off that computed bucket_date — not a raw
// fd.scheduled_arrival_at::date BETWEEN filter (the original bug: filtering on the raw date
// silently excludes any invoice whose real cash lands outside the raw-date window).
const proformaBlockMatch = src.match(/const proformaRes = await client\.query\(([\s\S]*?)\[query\.data\.operating_company_id, startWeek, endWeek\]/);
if (!proformaBlockMatch) {
  failures.push(`${routesPath}: could not locate the proformaRes query block at all — cannot verify the ETA-bucket fix`);
} else {
  const block = proformaBlockMatch[1];
  if (!/projectedCashDateSql\(\{\s*deliveryScheduledExpr:\s*"fd\.scheduled_arrival_at"\s*\}\)/.test(block)) {
    failures.push(`${routesPath}: proformaRes query no longer calls projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })`);
  }
  if (!/AS bucket_date/.test(block)) {
    failures.push(`${routesPath}: proformaRes query no longer aliases the computed date as bucket_date`);
  }
  if (!/WHERE bucket_date BETWEEN \$2::date AND \$3::date/.test(block)) {
    failures.push(`${routesPath}: proformaRes query no longer filters the date window on the computed bucket_date — a raw fd.scheduled_arrival_at filter silently drops ETA-shifted invoices again`);
  }
  if (!/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(block) || !/LEFT JOIN catalogs\.payment_terms pt ON pt\.id = c\.payment_terms_id/.test(block)) {
    failures.push(`${routesPath}: proformaRes query no longer joins mdata.customers/catalogs.payment_terms — projectedCashDateSql requires both aliases`);
  }
}

if (failures.length > 0) {
  console.error("verify-acct-f9408-cash-forecast-proforma-eta-bucket: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-acct-f9408-cash-forecast-proforma-eta-bucket: OK — /accounting/cash-forecast proforma bucketing reuses the shared ETA-projection helper, gated on CASH_FOLLOWS_ETA_ENABLED, filtered on the computed bucket_date"
);
