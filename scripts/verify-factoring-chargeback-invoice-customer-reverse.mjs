#!/usr/bin/env node
/**
 * FACT-F5820 — chargeback rows already resolve their canonical invoice/customer for filtering;
 * preserve those IDs + human labels through both mounted reverse surfaces.
 * @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["home.chargebacks_fees"],"task":"FACT-F5820","vertical":"column-wave"}
 */
import fs from "node:fs";

const LABEL = "verify-factoring-chargeback-invoice-customer-reverse";
const FILES = {
  route: "apps/backend/src/factoring/factoring.routes.ts",
  api: "apps/frontend/src/api/factoring.ts",
  table: "apps/frontend/src/pages/factoring/ChargebacksTable.tsx",
  tracker: "apps/frontend/src/pages/factoring/ReserveTracker.tsx",
  matrix: "docs/specs/scoreboard/modules/factoring.required.json",
};
const checks = [
  ["route", /chargebacks-fees[\s\S]{0,2800}inv\.invoice_id,[\s\S]{0,100}inv\.invoice_display_id,[\s\S]{0,100}inv\.customer_id,[\s\S]{0,100}inv\.customer_name/, "route projects invoice/customer identity"],
  // ACCT-F26015 (#21169, 2026-09-06) dropped the ::text cast — it 500'd the customer filter (text = uuid) — so the
  // projection is `i.customer_id,`. Matched on the route with SQL `--` comments stripped (ROUND 341: the rationale
  // comment quotes "i.customer_id," and must never stand in for the projection itself).
  ["route", /i\.id::text AS invoice_id,[\s\S]{0,100}i\.display_id AS invoice_display_id,\s{0,200}i\.customer_id(?:::text AS customer_id)?,[\s\S]{0,100}c\.customer_name/, "lateral producer resolves human identities"],
  ["route", /LEFT JOIN mdata\.customers c[\s\S]{0,100}c\.operating_company_id = i\.operating_company_id/, "customer label join is company scoped"],
  ["route", /i\.factoring_advance_id = cf\.factoring_advance_id[\s\S]{0,100}i\.operating_company_id = cf\.operating_company_id/, "invoice producer binds advance and company"],
  ["api", /FactoringChargebackFeeRow[\s\S]{0,500}invoice_id: string \| null;[\s\S]{0,120}invoice_display_id: string \| null;/, "API types invoice identity"],
  ["api", /FactoringChargebackFeeRow[\s\S]{0,500}customer_id: string \| null;[\s\S]{0,120}customer_name: string \| null;/, "API types customer identity"],
  ["table", /kind="invoice" id=\{row\.invoice_id\}[\s\S]{0,140}row\.invoice_display_id/, "chargebacks table drills exact human invoice"],
  ["table", /kind="customer" id=\{row\.customer_id\}[\s\S]{0,140}row\.customer_name/, "chargebacks table drills exact human customer"],
  ["tracker", /kind="invoice" id=\{row\.invoice_id\}[\s\S]{0,140}row\.invoice_display_id/, "reserve tracker drills exact human invoice"],
  ["tracker", /kind="customer" id=\{row\.customer_id\}[\s\S]{0,140}row\.customer_name/, "reserve tracker drills exact human customer"],
  ["matrix", /"id": "home\.chargebacks_fees"[\s\S]{0,260}"reverse_link"/, "exact Required leaf owns reverse_link"],
];
const stripSqlComments = (src) => src.replace(/--[^\n]*/g, "");
const live = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => {
    const text = fs.readFileSync(file, "utf8");
    return [key, key === "route" ? stripSqlComments(text) : text];
  }),
);
const audit = (src) => checks.filter(([key, re]) => !re.test(src[key])).map(([, , message]) => message);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [key, re, message] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[key].replace(new RegExp(re.source, flags), "/* planted FACT-F5820 defect */");
    if (planted === live[key] || !audit({ ...live, [key]: planted }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${message}`);
      process.exit(1);
    }
  }
  // ROUND 341: a comment that quotes the projection must not satisfy the check once the projection itself is gone.
  const rawRoute = fs.readFileSync(FILES.route, "utf8");
  const commentOnly = rawRoute.replace(/(\n\s*)i\.customer_id,(\n\s*c\.customer_name)/, "$1-- i.customer_id,$2");
  if (commentOnly === rawRoute || !audit({ ...live, route: stripSqlComments(commentOnly) }).includes("lateral producer resolves human identities")) {
    console.error(`${LABEL} SELFTEST FAIL — a commented-out customer_id projection was accepted`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length + 1}/${checks.length + 1} production/matrix defects rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — chargeback invoice/customer reverse drills are company-scoped and human-labelled`);
