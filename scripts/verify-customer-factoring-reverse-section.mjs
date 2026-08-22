#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^(factors\\.admin|batches\\.detail)$","task":"LINK-F5178-customer-factoring-reverse"} */
/**
 * FACT-F5796 — customer factoring and recourse invoice reverse chains.
 * The selected company/customer must drive the canonical read and URL round-trip;
 * recourse rows must resolve a same-company invoice and drill by its exact ID/label.
 *
 * Self-test: node scripts/verify-customer-factoring-reverse-section.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-customer-factoring-reverse-section";
const F = {
  section: "apps/frontend/src/components/customers/CustomerFactoringReverseSection.tsx",
  recourse: "apps/frontend/src/components/customers/CustomerFactoringRecourseReverseSection.tsx",
  api: "apps/frontend/src/api/factoring.ts",
  routes: "apps/backend/src/factoring/factoring.routes.ts",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
  admin: "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
  entity: "apps/frontend/src/components/shared/EntityLink.tsx",
};

const CHECKS = [
  { name: "customer factoring query key binds company and customer", file: F.section, pattern: /queryKey: \["customer-factoring-reverse", operatingCompanyId, customerId\]/ },
  { name: "customer factoring read binds customer and company", file: F.section, pattern: /getCustomerFactor\(customerId, operatingCompanyId\)/ },
  { name: "customer factoring read is disabled without both identities", file: F.section, pattern: /enabled: Boolean\(operatingCompanyId && customerId\)/ },
  { name: "customer detail imports reverse section", file: F.customer, pattern: /import \{ CustomerFactoringReverseSection \}/ },
  { name: "customer detail mounts exact company/customer reverse section", file: F.customer, pattern: /<CustomerFactoringReverseSection operatingCompanyId=\{operatingCompanyId\} customerId=\{id\}/ },
  { name: "factor admin reads customer deep link", file: F.admin, pattern: /const deepLinkCustomerId = searchParams\.get\("customer_id"\)/ },
  { name: "factor admin hydrates exact deep-linked customer", file: F.admin, pattern: /if \(!deepLinkCustomerId\) return;\s+setDetailCustomerId\(deepLinkCustomerId\)/ },
  { name: "customer selector writes exact URL key", file: F.admin, pattern: /function selectDetailCustomer\(next: string\) \{\s+setDetailCustomerId\(next\);\s+patchSearchParam\("customer_id", next\);\s+\}/ },
  { name: "batch rows drill by exact batch ID and human number", file: F.admin, pattern: /kind="factoring_batch" id=\{row\.id\} label=\{entityLabel\(row\.batch_number, row\.id, "Batch"\)\}/ },
  { name: "batch rows ban advance-table route", file: F.admin, banned: /kind="factoring_advance" id=\{row\.id\}/ },
  { name: "batch EntityLink resolves canonical batch route", file: F.entity, pattern: /case "factoring_batch":[\s\S]{0,600}return `\/factoring\/batches\/\$\{id\}`/ },
  { name: "customer reverse drills to exact factor identity", file: F.section, pattern: /kind="factor"\s+id=\{factor\.id\}\s+label=\{factor\.name\}/ },
  { name: "factor EntityLink resolves canonical factor route", file: F.entity, pattern: /case "factor":\s+return `\/factoring\/factors\?factor_id=\$\{id\}`/ },
  { name: "customer reverse opens exact scoped factor-admin view", file: F.section, pattern: /kind="factoring_factors_customer"\s+id=\{customerId\}/ },
  { name: "customer factor view bans bare route links", file: F.section, banned: /to=(?:\{`)?["']?\/factoring\/factors/ },
  { name: "customer factor EntityLink resolves scoped route", file: F.entity, pattern: /case "factoring_factors_customer":\s+return `\/factoring\/factors\?customer_id=\$\{id\}`/ },
  { name: "recourse producer projects canonical invoice/customer/load", file: F.routes, pattern: /SELECT i\.id AS invoice_id, i\.customer_id, i\.source_load_id AS load_id/ },
  { name: "recourse invoice join binds advance FK and company", file: F.routes, pattern: /WHERE i\.factoring_advance_id = rr\.factoring_advance_id\s+AND i\.operating_company_id = rr\.operating_company_id/ },
  { name: "recourse outer read is selected-company scoped", file: F.routes, pattern: /WHERE rr\.operating_company_id = \$1::uuid/ },
  { name: "recourse response returns canonical reverse IDs", file: F.routes, pattern: /rr\.\*,\s+inv\.invoice_id,\s+inv\.customer_id,\s+inv\.load_id/ },
  { name: "recourse API types canonical invoice ID", file: F.api, pattern: /FactoringRecourseInvoice[\s\S]{0,500}invoice_id: string \| null/ },
  { name: "recourse row drills exact invoice with human reference", file: F.recourse, pattern: /<EntityLinkOrTombstone[\s\S]{0,180}kind="invoice"[\s\S]{0,120}id=\{row\.invoice_id\}[\s\S]{0,120}name=\{row\.invoice_reference\}/ },
];

function readSources() {
  return Object.fromEntries(Object.values(F).map((file) => [file, fs.readFileSync(file, "utf8")]));
}

export function collectFailures(sources) {
  return CHECKS.filter((check) =>
    check.banned ? check.banned.test(sources[check.file]) : !check.pattern.test(sources[check.file])
  ).map((check) => check.name);
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(sources);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const inert = [];
  for (const check of CHECKS) {
    const original = sources[check.file];
    const planted = check.banned
      ? `${original}\n/* planted */ <Link to="/factoring/factors"><EntityLink kind="factoring_advance" id={row.id} /></Link>\n`
      : original.replace(check.pattern, "/* planted FACT-F5796 customer/invoice reverse defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length}/${CHECKS.length} independent customer/invoice reverse plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact customer/invoice reverse obligations ratcheted`);
