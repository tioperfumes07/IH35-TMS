#!/usr/bin/env node
/**
 * @matrix-built {"modules":["banking"],"cols":["ap_bill"],"leafRe":"^transactions\\.(list|categorize)$","task":"ACCT-F5153-BANKING-MATCHED-BILL-DRILL"}
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): banking's transactions.list /
 * transactions.categorize leaves had a real gap — bt.matched_bill_id was selected by
 * /api/v1/banking/plaid/company-transactions but never joined to a human label, and never rendered
 * anywhere in the transaction row (every other matched kind — load/settlement/journal_entry — was).
 *
 * Self-test: node scripts/verify-banking-matched-bill-drill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-matched-bill-drill";

const ROUTE_FILE = "apps/backend/src/integrations/plaid/link.routes.ts";
const VIEW_FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const PANEL_FILE = "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx";
const API_FILE = "apps/frontend/src/api/banking.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function audit(src) {
  const failures = [];

  if (!/bill\.bill_number AS matched_bill_number/.test(src.route)) {
    failures.push(`${ROUTE_FILE}: company-transactions SELECT must join matched_bill_number`);
  }
  if (!/LEFT JOIN accounting\.bills bill[\s\S]{0,80}ON bill\.id = bt\.matched_bill_id[\s\S]{0,80}bill\.operating_company_id = bt\.operating_company_id/.test(src.route)) {
    failures.push(`${ROUTE_FILE}: missing entity-scoped LEFT JOIN accounting.bills on matched_bill_id`);
  }
  if (!/settlement\.display_id AS matched_settlement_display_id/.test(src.route) || !/LEFT JOIN driver_finance\.settlements settlement[\s\S]{0,100}settlement\.id = bt\.matched_settlement_id[\s\S]{0,100}settlement\.operating_company_id = bt\.operating_company_id/.test(src.route)) {
    failures.push(`${ROUTE_FILE}: missing entity-scoped matched settlement label`);
  }

  if (!/matched_bill_number\??:\s*string \| null/.test(src.api)) {
    failures.push(`${API_FILE}: PlaidBankTransaction type must declare matched_bill_number`);
  }
  if (!/matched_settlement_display_id\??:\s*string \| null/.test(src.api)) {
    failures.push(`${API_FILE}: PlaidBankTransaction type must declare matched_settlement_display_id`);
  }

  if (!/tx\.matched_bill_id \?[\s\S]{0,120}kind="bill"[\s\S]{0,120}id=\{tx\.matched_bill_id\}[\s\S]{0,120}entityLabel\(tx\.matched_bill_number,\s*tx\.matched_bill_id/.test(src.view)) {
    failures.push(`${VIEW_FILE}: transaction row must render a real EntityLink kind="bill" for matched_bill_id`);
  }
  if (!/kind="bill" id=\{t\.matched_bill_id\} label=\{entityLabel\(t\.matched_bill_number, t\.matched_bill_id, "Bill"\)\}/.test(src.panel)) {
    failures.push(`${PANEL_FILE}: Plaid table must drill matched bill with its resolved label`);
  }
  if (!/kind="settlement" id=\{t\.matched_settlement_id\} label=\{entityLabel\(t\.matched_settlement_display_id, t\.matched_settlement_id, "Settlement"\)\}/.test(src.panel)) {
    failures.push(`${PANEL_FILE}: Plaid table must drill matched settlement with its resolved label`);
  }

  return failures;
}

function loadReal() {
  return { route: read(ROUTE_FILE), api: read(API_FILE), view: read(VIEW_FILE), panel: read(PANEL_FILE) };
}

if (process.argv.includes("--selftest")) {
  const good = loadReal();
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["route-select", "route", /bill\.bill_number AS matched_bill_number/, "-- removed"],
    ["route-join", "route", /LEFT JOIN accounting\.bills bill\n\s+ON bill\.id = bt\.matched_bill_id/, "-- removed join"],
    ["api-type", "api", /matched_bill_number\?:\s*string \| null;/, "// removed"],
    ["settlement-label", "route", /settlement\.display_id AS matched_settlement_display_id/, "NULL AS missing_settlement_label"],
    ["settlement-api", "api", /matched_settlement_display_id\?:\s*string \| null;/, "// removed"],
    ["view-link", "view", /kind="bill"\n\s+id=\{tx\.matched_bill_id\}/, 'kind="load"\n                        id={tx.matched_bill_id}'],
    ["panel-bill", "panel", /kind="bill" id=\{t\.matched_bill_id\}/, 'kind="load" id={t.matched_bill_id}'],
    ["panel-settlement", "panel", /kind="settlement" id=\{t\.matched_settlement_id\}/, 'kind="load" id={t.matched_settlement_id}'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadReal());
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — matched_bill_id is joined to a real label and drilled through on the banking transactions surface`);
