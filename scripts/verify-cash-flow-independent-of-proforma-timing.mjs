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
 * This guard locks that state against regression: cash-flow's no-proforma branch must keep using
 * rate_total_cents (not an invoice-derived amount) and the SAME scheduled-delivery dating as the
 * has-a-proforma branch; the first-pickup mint trigger must keep saying "never at book."
 */
import { readFileSync } from "node:fs";

const CASH_FLOW_PATH = "apps/backend/src/cash-flow/cash-flow.service.ts";
const PROFORMA_MINT_PATH = "apps/backend/src/accounting/proforma-mint-on-first-pickup.ts";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({ cashFlow = load(CASH_FLOW_PATH), proformaMint = load(PROFORMA_MINT_PATH) } = {}) {
  const failures = [];

  // cash-flow: the no-proforma CTE (`lp`) must still source its amount from rate_total_cents,
  // not from an invoice -- i.e. it must not require a proforma to exist to know the money is coming.
  const lpStart = cashFlow.indexOf("WITH lp AS (");
  if (lpStart === -1) {
    failures.push("cash-flow.service.ts no longer has the lp (no-proforma) CTE at all");
  } else {
    const lpBlock = cashFlow.slice(lpStart, lpStart + 900);
    if (!lpBlock.includes("COALESCE(l.rate_total_cents, 0) AS rate_total_cents")) {
      failures.push("the lp CTE no longer sources its projected amount from rate_total_cents directly");
    }
    if (!lpBlock.includes('${noLiveProformaInvoiceSql("l")}')) {
      failures.push("the lp CTE no longer scopes itself to loads with NO live proforma (noLiveProformaInvoiceSql)");
    }
    if (!lpBlock.includes('deliveryScheduledExpr: "fd.scheduled_arrival_at"')) {
      failures.push("the lp CTE no longer dates its bucket off the last-delivery-stop scheduled_arrival_at");
    }
  }

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
  const mutations = [
    [
      "lp CTE switched to reading an invoice amount instead of rate_total_cents",
      "COALESCE(l.rate_total_cents, 0) AS rate_total_cents",
      "COALESCE(i.total_amount_cents, 0) AS rate_total_cents",
    ],
    [
      "no-proforma scoping removed from lp CTE",
      'AND ${noLiveProformaInvoiceSql("l")}\n    ),\n    pf AS (',
      "AND true\n    ),\n    pf AS (",
    ],
    [
      "locked 'never at book' design statement removed",
      "mint the NON-POSTING proforma at first pickup, never at book",
      "mint the proforma at booking time",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    const inCashFlow = cashFlow.includes(from);
    const inProformaMint = proformaMint.includes(from);
    if (!inCashFlow && !inProformaMint) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const args = inProformaMint
      ? { cashFlow, proformaMint: proformaMint.replace(from, to) }
      : { cashFlow: cashFlow.replace(from, to), proformaMint };
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
