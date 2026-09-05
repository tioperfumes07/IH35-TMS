#!/usr/bin/env node
// SET-ACCRUAL guard (owner order 2026-09-05, re-measured live on USMCA): the Dispatch Settlements /
// Pre-Settlements list showed $0.00 gross on 10 open settlements that carried $34,356.30 of real
// settlement_lines, because (a) the list read rendered the STORED header gross_pay (0 until close)
// instead of the line-derived accrual, and (b) the canonical close aggregation's earnings bucket
// dropped the 'deadhead_pay' line_type (empty-leg driver pay, $2,763.49 live) out of gross entirely.
//
// This guard pins the fix so it cannot silently regress:
//   1. settlement-line-buckets.ts is the ONE classifier and its earnings bucket includes deadhead_pay.
//   2. the close aggregation (settlements-load-bookended.service.ts) sums gross via the shared
//      settlementEarningsSumSql (not a hardcoded list that can drift and re-drop deadhead_pay).
//   3. the settlements LIST read (settlements.routes.ts) computes accrued_gross from the lines and
//      shows the accrual for pre-close statuses via isPreCloseStatus.
//
// Usage: node scripts/verify-settlement-accrual-and-deadhead.mjs [--selftest]
import { readFileSync } from "node:fs";

const BUCKETS = "apps/backend/src/driver-finance/settlement-line-buckets.ts";
const CLOSE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const LIST = "apps/backend/src/driver-finance/settlements.routes.ts";

function audit(buckets, close, list) {
  const f = [];

  // 1. Canonical earnings bucket must include deadhead_pay.
  const earningsBlock = (buckets.match(/SETTLEMENT_EARNINGS_LINE_TYPES\s*=\s*\[([\s\S]*?)\]/) ?? [])[1] ?? "";
  if (!earningsBlock) f.push(`${BUCKETS}: SETTLEMENT_EARNINGS_LINE_TYPES array not found`);
  else if (!/"deadhead_pay"/.test(earningsBlock))
    f.push(`${BUCKETS}: SETTLEMENT_EARNINGS_LINE_TYPES must include "deadhead_pay" (empty-leg driver pay is gross)`);

  // 2. The close aggregation must sum gross via the shared classifier, not a hardcoded list.
  if (!/settlementEarningsSumSql\(\)/.test(close))
    f.push(`${CLOSE}: aggregateSettlementTotals must sum earnings via settlementEarningsSumSql() (shared classifier)`);
  if (/CASE WHEN line_type IN \('earnings', 'extra_pay', 'team_split_primary', 'team_split_secondary'\)/.test(close))
    f.push(`${CLOSE}: the hardcoded earnings CASE (missing deadhead_pay) must be gone — use the shared classifier`);

  // 3. The list read must compute the accrual and gate the displayed gross on pre-close status.
  if (!/accrued_gross/.test(list))
    f.push(`${LIST}: the settlements list read must compute accrued_gross from settlement_lines`);
  if (!/settlementEarningsSumSql\("sl"\)/.test(list))
    f.push(`${LIST}: accrued_gross must use the shared settlementEarningsSumSql("sl") classifier`);
  if (!/isPreCloseStatus\(/.test(list))
    f.push(`${LIST}: displayed gross_pay must switch to the accrual for pre-close statuses via isPreCloseStatus`);
  if (!/preClose \? accruedGross/.test(list))
    f.push(`${LIST}: gross_pay must resolve to the accrual when the settlement is pre-close`);

  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const buckets = readFileSync(BUCKETS, "utf8");
  const close = readFileSync(CLOSE, "utf8");
  const list = readFileSync(LIST, "utf8");

  const failures = audit(buckets, close, list);
  if (failures.length) {
    console.error("FAIL verify-settlement-accrual-and-deadhead:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const b1 = buckets.replace(/"deadhead_pay",?/, "");
    if (audit(b1, close, list).length === 0) { console.error("SELFTEST FAIL: dropping deadhead_pay did not trip"); process.exit(1); }
    const c1 = close.replace(/settlementEarningsSumSql\(\)/, "'X'");
    if (audit(buckets, c1, list).length === 0) { console.error("SELFTEST FAIL: close not using shared classifier did not trip"); process.exit(1); }
    const l1 = list.replaceAll("accrued_gross", "xx_gross");
    if (audit(buckets, close, l1).length === 0) { console.error("SELFTEST FAIL: removing accrual from list did not trip"); process.exit(1); }
    const l2 = list.replaceAll("preClose ? accruedGross", "false ? accruedGross");
    if (audit(buckets, close, l2).length === 0) { console.error("SELFTEST FAIL: not gating gross on pre-close did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }

  console.log("PASS verify-settlement-accrual-and-deadhead");
}

main();
