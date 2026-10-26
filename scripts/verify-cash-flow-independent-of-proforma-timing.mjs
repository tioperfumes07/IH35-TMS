#!/usr/bin/env node
/**
 * verify-cash-flow-independent-of-proforma-timing.mjs
 *
 * SET-03 (owner ruling 2026-09-03/09-04, formalized to the ten-point completion standard
 * 2026-09-04): "proforma income at creation; both numbers onto cash flow at projected delivery."
 * Owner verified the reasoning live and CLOSED this AS ALREADY CORRECT: CASH_FOLLOWS_ETA_ENABLED
 * is ON for USMCA (confirmed live, this pass) and getActualVsProjected already dates projected
 * income off the load's last-delivery scheduled_arrival_at for loads WITH NO proforma yet (the
 * `lp` CTE, using rate_total_cents directly via noLiveProformaInvoiceSql) exactly the same as it
 * does for loads that already have one (the `pf` CTE). Moving the proforma mint itself to booking
 * time would only make an A/R document exist a few days earlier -- it would not change when the
 * money shows up on the cash-flow forecast, which is already correct. Two prior locked rulings
 * (GO-19 slice 04 / GO-27 Gate 2.3: never mint at book; ACCT-F267: never mint before the rate is
 * known) STAND -- proforma-mint-on-first-pickup.ts is not changed.
 *
 * ROUND 443.213 supersedes the historical rate_total_cents implementation above: unbilled
 * revenue now comes from canonical charge lines through loadCostsRevenueJoin. It still needs
 * no proforma mint to project income. Both forecast streams share delivery dating; the
 * first-pickup mint trigger must keep saying "never at book."
 */
import { readFileSync } from "node:fs";

const CASH_FLOW_PATH = "apps/backend/src/cash-flow/cash-flow.service.ts";
const PROFORMA_MINT_PATH = "apps/backend/src/accounting/proforma-mint-on-first-pickup.ts";
const RECEIPTS_PATH = "apps/backend/src/cash-flow/cash-flow-receipts.sql.ts";
const REVENUE_PATH = "apps/backend/src/accounting/load-costs-live-documents.sql.ts";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({ cashFlow = load(CASH_FLOW_PATH), receipts = load(RECEIPTS_PATH), revenue = load(REVENUE_PATH), proformaMint = load(PROFORMA_MINT_PATH) } = {}) {
  const failures = [];

  // The unbilled CTE must retain canonical booked revenue without requiring an invoice.
  const lpStart = receipts.indexOf("WITH unbilled_receipts AS (");
  if (lpStart === -1) {
    failures.push("cash-flow.service.ts no longer has the lp (no-proforma) CTE at all");
  } else {
    const lpBlock = receipts.slice(lpStart, receipts.indexOf("), proforma_receipts AS ("));
    if (!lpBlock.includes("COALESCE(revenue.revenue_cents, 0)::bigint AS amount_cents") || !lpBlock.includes('${loadCostsRevenueJoin("l")}') || !revenue.includes("FROM dispatch.load_charge_lines lcl") || !revenue.includes("ELSE booked.cents")) {
      failures.push("unbilled forecast must read canonical booked charge lines without requiring an invoice");
    }
    if (!lpBlock.includes("AND NOT EXISTS (SELECT 1 FROM accounting.invoices pf") || !lpBlock.includes("pf.status = 'proforma'")) {
      failures.push("the lp CTE no longer scopes itself to loads with NO live proforma (noLiveProformaInvoiceSql)");
    }
    if (!lpBlock.includes('${forecastDate}') || !receipts.includes('deliveryScheduledExpr: "fd.scheduled_arrival_at"') || !receipts.includes("ORDER BY sequence_number DESC LIMIT 1")) {
      failures.push("the lp CTE no longer dates its bucket off the last-delivery-stop scheduled_arrival_at");
    }
  }
  if (!cashFlow.includes('${cashFlowReceiptsSql(cashFollowsEta)}')) failures.push("public forecast reader bypasses shared receipt SQL");

  // proforma-mint-on-first-pickup.ts: the locked design (never mint at book) must still be the
  // stated contract -- this file's own header is the source of truth for that ruling.
  if (!/mint the NON-POSTING proforma at first pickup, never at book/.test(proformaMint)) {
    failures.push("proforma-mint-on-first-pickup.ts no longer states the locked 'never at book' design");
  }
  if (!/firstPickupStop/.test(proformaMint)) {
    failures.push("proforma-mint-on-first-pickup.ts no longer gates minting on the first-pickup stop");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-cash-flow-independent-of-proforma-timing SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const cashFlow = load(CASH_FLOW_PATH);
  const proformaMint = load(PROFORMA_MINT_PATH);
  const receipts = load(RECEIPTS_PATH), revenue = load(REVENUE_PATH);
  const mutations = [
    [
      "unbilled CTE switched to an invoice amount instead of canonical booked revenue",
      "COALESCE(revenue.revenue_cents, 0)::bigint AS amount_cents",
      "COALESCE(i.total_cents, 0)::bigint AS amount_cents",
    ],
    [
      "no-proforma scoping removed from lp CTE",
      "AND NOT EXISTS (SELECT 1 FROM accounting.invoices pf",
      "AND EXISTS (SELECT 1 FROM accounting.invoices pf",
    ],
    [
      "locked 'never at book' design statement removed",
      "mint the NON-POSTING proforma at first pickup, never at book",
      "mint the proforma at booking time",
    ],
  ];
  mutations.push(["canonical booked revenue fallback removed", "ELSE booked.cents", "ELSE 0"]);
  mutations.push(["last delivery order removed", "ORDER BY sequence_number DESC LIMIT 1", "ORDER BY sequence_number ASC LIMIT 1"]);
  mutations.push(["shared receipt consumer removed", '${cashFlowReceiptsSql(cashFollowsEta)}', '${removedReceipts(cashFollowsEta)}']);
  const escaped = [];
  for (const [name, from, to] of mutations) {
    const inCashFlow = cashFlow.includes(from);
    const inProformaMint = proformaMint.includes(from);
    if (!inCashFlow && !inProformaMint && !receipts.includes(from) && !revenue.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const args = { cashFlow, proformaMint, receipts, revenue };
    const key = inProformaMint ? "proformaMint" : inCashFlow ? "cashFlow" : receipts.includes(from) ? "receipts" : "revenue";
    args[key] = args[key].replaceAll(from, to);
    if (collectFailures(args).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-cash-flow-independent-of-proforma-timing SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-cash-flow-independent-of-proforma-timing SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-cash-flow-independent-of-proforma-timing: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-flow-independent-of-proforma-timing: OK — cash-flow already dates projected income off scheduled delivery independent of proforma timing; the locked 'never mint at book' design stands unchanged");
