#!/usr/bin/env node
/**
 * ACCT-F5901 — views.factoring_chargebacks_fees must select a real advance dollar amount, and
 * ChargebacksTable.tsx's Advance column must render it (fmtCurrency), never the same free-text
 * memo/statement_reference string the neighboring Statement Ref column already renders.
 *
 * Live-verified 2026-08-22: views.factoring_chargebacks_fees now returns advance_amount=1794.50
 * for factoring_advance_id 87e6389a-970c-4342-8c5e-99a39f3ce8fd, matching the same figure
 * views.factoring_recourse_at_risk already correctly shows for the same underlying advance.
 */
import fs from "node:fs";

const LABEL = "verify-chargebacks-fees-advance-amount-column";
const F = {
  migration: "db/migrations/202613080000_acct_f5901_factoring_chargebacks_fees_advance_amount.sql",
  api: "apps/frontend/src/api/factoring.ts",
  table: "apps/frontend/src/pages/factoring/ChargebacksTable.tsx",
};
const checks = [
  ["migration", /\(fa\.advance_amount_cents::numeric \/ 100\) AS advance_amount/, "view migration selects the real advance dollar amount"],
  ["api", /FactoringChargebackFeeRow = \{[\s\S]{0,800}advance_amount: number;/, "FactoringChargebackFeeRow API type carries advance_amount"],
  ["table", /ChargebackFeeRow = \{[\s\S]{0,1200}advance_amount: number;/, "ChargebackFeeRow FE type carries advance_amount"],
  ["table", /EntityLink kind="factoring_advance" id=\{row\.factoring_advance_id\} label=\{fmtCurrency\(row\.advance_amount\)\}/, "Advance column renders the real dollar amount, not statement_reference/memo text"],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted ACCT-F5901 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — Chargebacks & Fees Advance column shows a real dollar amount`);
