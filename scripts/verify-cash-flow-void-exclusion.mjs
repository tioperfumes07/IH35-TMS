#!/usr/bin/env node
/**
 * verify-cash-flow-void-exclusion.mjs  (CASH-1 — permanent guard)
 *
 * The canonical void write-path (apps/backend/src/accounting/bills.service.ts
 * voidBill / voidBillPayment) stores `status = 'void'` (SINGULAR) and sets
 * `revoked_at = now()` — it NEVER writes `'voided'`. So the old cash-flow filters
 * `status <> 'voided'` / `NOT IN ('paid','voided')` were NO-OPS: voided bills and
 * bill-payments leaked into the cash-flow figures.
 *
 * This guard fails if apps/backend/src/cash-flow/cash-flow.service.ts reintroduces
 * a bare-'voided' exclusion that omits the singular 'void' (the real stored value),
 * and it requires the shared notVoidedSql() helper to keep matching both 'void'
 * and 'voided' plus `revoked_at IS NULL` (mirroring the authoritative reader in
 * bills.service.ts listBills).
 *
 * ACCT-F6432 / CASHFLOW-PROFORMA-PROJECTED-LABELED: cash-flow must include live
 * proforma as labeled projected income (not Open A/R), exclude those loads from
 * load-rate income, and cash-forecast Open A/R must exclude status='proforma'.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASH_FLOW_FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const FORECAST_FILE = "apps/backend/src/accounting/cash-forecast.routes.ts";
const LABEL = "verify-cash-flow-void-exclusion";

function readRepo(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

export function checkCashFlow(src) {
  const errs = [];
  if (!src) {
    errs.push(`${CASH_FLOW_FILE} not found`);
    return errs;
  }

  const helper = src.match(/export function notVoidedSql\([^)]*\)\s*:\s*string\s*\{[\s\S]*?\n\}/);
  if (!helper) {
    errs.push("notVoidedSql(alias) helper is missing — the void-exclusion predicate must be centralized.");
  } else {
    const h = helper[0];
    if (!h.includes("'void'")) errs.push("notVoidedSql must exclude the SINGULAR 'void' (the value the write-path stores).");
    if (!h.includes("'voided'")) errs.push("notVoidedSql must also exclude legacy 'voided' status.");
    if (!/revoked_at\s+IS\s+NULL/i.test(h)) errs.push("notVoidedSql must also exclude rows carrying revoked_at (revoked_at IS NULL).");
  }

  const bareNe = src.match(/\b\w+\.status\s*(?:<>|!=)\s*'voided'/g);
  if (bareNe) {
    errs.push(`Found no-op void filter(s) that miss the stored 'void' value: ${bareNe.join(", ")} — use notVoidedSql().`);
  }

  const notInMatches = src.match(/status\s+NOT\s+IN\s*\([^)]*\)/gi) || [];
  for (const m of notInMatches) {
    if (m.includes("'voided'") && !m.includes("'void'")) {
      errs.push(`NOT IN filter excludes 'voided' but not the stored 'void': ${m} — use notVoidedSql().`);
    }
  }

  if (!src.includes("noLiveProformaInvoiceSql")) {
    errs.push("noLiveProformaInvoiceSql must exist so load-rate income does not double-count live proforma.");
  }
  if (!/i\.status\s*=\s*'proforma'/.test(src)) {
    errs.push("cash-flow.service.ts must select live invoices with status = 'proforma' as projected income.");
  }
  if (!/basis:\s*"Proforma"/.test(src)) {
    errs.push('cash-flow.service.ts must label proforma income basis: "Proforma".');
  }
  if (!/proformaRemainingCentsSql/.test(src)) {
    errs.push("proformaRemainingCentsSql must net paid + broker advance so banked cash is not re-projected.");
  }

  return errs;
}

export function checkForecast(src) {
  const errs = [];
  if (!src) {
    errs.push(`${FORECAST_FILE} not found`);
    return errs;
  }
  if (!/status\s+NOT\s+IN\s*\([^)]*'proforma'[^)]*\)/.test(src)) {
    errs.push("cash-forecast Open A/R query must exclude status 'proforma' (not legally owed A/R).");
  }
  if (!/i\.status\s*=\s*'proforma'/.test(src)) {
    errs.push("cash-forecast must add proforma rows as projected inflows (status = 'proforma').");
  }
  if (!/inflowOther/.test(src)) {
    errs.push("cash-forecast must pass inflowOther into buildForecastWeeks (Proforma / Pre-invoice column).");
  }
  if (!/lastDeliveryStopLateralSql/.test(src) && !/stop_type\s*=\s*'delivery'/.test(src)) {
    errs.push("cash-forecast proforma inflows must bucket on dispatch delivery (lastDeliveryStopLateralSql / load_stops delivery).");
  }
  if (!/l\.status\s*<>\s*'cancelled'/.test(src) && !/ACTIVE_LOAD_FILTER/.test(src)) {
    errs.push("cash-forecast proforma inflows must skip cancelled loads.");
  }
  if (!/proformaRemainingCentsSql/.test(src)) {
    errs.push("cash-forecast proforma inflows must use proformaRemainingCentsSql (net of paid/advance).");
  }
  return errs;
}

export function checkAll({ cashFlow, forecast } = { cashFlow: readRepo(CASH_FLOW_FILE), forecast: readRepo(FORECAST_FILE) }) {
  return [...checkCashFlow(cashFlow), ...checkForecast(forecast)];
}

function selftest() {
  const goodCash = `
export function notVoidedSql(alias: string): string {
  return \`\${alias}.status NOT IN ('void', 'voided') AND \${alias}.revoked_at IS NULL\`;
}
export function noLiveProformaInvoiceSql(loadAlias) { return "x"; }
export function proformaRemainingCentsSql(invoiceAlias) { return "x"; }
AND i.status = 'proforma'
basis: "Proforma"
`;
  const goodForecast = `
AND status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
AND i.status = 'proforma'
inflowOther
lastDeliveryStopLateralSql
l.status <> 'cancelled'
proformaRemainingCentsSql
`;
  const badVoidedOnly = `
export function notVoidedSql(alias) {
  return \`\${alias}.status <> 'voided'\`;
}
`;
  const badNoProforma = `
export function notVoidedSql(alias) {
  return \`\${alias}.status NOT IN ('void', 'voided') AND \${alias}.revoked_at IS NULL\`;
}
`;
  const badForecastAr = `
AND status NOT IN ('void', 'voided', 'draft')
AND i.status = 'proforma'
inflowOther
lastDeliveryStopLateralSql
l.status <> 'cancelled'
proformaRemainingCentsSql
`;

  const cases = [
    { name: "good", cashFlow: goodCash, forecast: goodForecast, want: 0 },
    { name: "voided-only helper", cashFlow: badVoidedOnly, forecast: goodForecast, wantMin: 1 },
    { name: "missing proforma include", cashFlow: badNoProforma, forecast: goodForecast, wantMin: 1 },
    { name: "forecast AR omits proforma exclude", cashFlow: goodCash, forecast: badForecastAr, wantMin: 1 },
  ];
  for (const c of cases) {
    const got = checkAll({ cashFlow: c.cashFlow, forecast: c.forecast }).length;
    if (c.want != null && got !== c.want) {
      console.error(`${LABEL} --selftest ${c.name}: expected ${c.want} findings, got ${got}`);
      process.exit(1);
    }
    if (c.wantMin != null && got < c.wantMin) {
      console.error(`${LABEL} --selftest ${c.name}: expected >=${c.wantMin} findings, got ${got}`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] --selftest OK`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const errs = checkAll();
    if (errs.length) {
      console.error("[verify-cash-flow-void-exclusion] FAILED");
      for (const e of errs) console.error("  ✗ " + e);
      process.exit(1);
    }
    console.log("[verify-cash-flow-void-exclusion] OK — cash-flow excludes voided bills/bill-payments by the real stored value; proforma is projected, not Open A/R.");
  }
}
