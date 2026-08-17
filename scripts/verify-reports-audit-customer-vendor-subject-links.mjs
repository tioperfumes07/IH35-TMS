#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["customer","vendor","connectivity","reverse_link"],"leafRe":"^audit\\.activity_by_user$","task":"LV-REPORTS-AUDIT-CUSTOMER-VENDOR-SUBJECT-LABELS"} */
import fs from "node:fs";

const LABEL = "verify-reports-audit-customer-vendor-subject-links";
const FILES = {
  route: "apps/backend/src/audit/audit-reports.routes.ts",
  page: "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx",
};
const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function failures(input = sources) {
  const problems = [];
  for (const [kind, alias, labelColumn] of [
    ["customer", "audit_customer", "customer_name"],
    ["vendor", "audit_vendor", "vendor_name"],
  ]) {
    const projection = `WHEN \${alias}.subject_type = '${kind}' THEN NULLIF(TRIM(${alias}.${labelColumn}), '')`;
    if (!input.route.includes(projection)) {
      problems.push(`${kind} subject must project its canonical human label`);
    }
    const joinStart = `LEFT JOIN mdata.${kind}s ${alias}`;
    const idJoin = `${alias}.id = \${alias}.subject_id`;
    const companyJoin = `${alias}.operating_company_id = \${alias}.operating_company_id`;
    if (!input.route.includes(joinStart) || !input.route.includes(idJoin) || !input.route.includes(companyJoin)) {
      problems.push(`${kind} subject join must resolve by id inside the event operating company`);
    }
    if (!new RegExp(`${kind}:\\s*"${kind}"`).test(input.page)) {
      problems.push(`${kind} subject kind must map to the canonical EntityLink kind`);
    }
  }
  if (!/<EntityLink kind=\{kind\} id=\{row\.subject_id\} label=\{label\}/.test(input.page)) {
    problems.push("shared audit subject renderer must drill through with canonical id and label");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["customer-label", "route", /audit_customer\.customer_name/, "NULL"],
    ["customer-scope", "route", /audit_customer\.operating_company_id = \$\{alias\}\.operating_company_id/, "TRUE"],
    ["vendor-label", "route", /audit_vendor\.vendor_name/, "NULL"],
    ["vendor-scope", "route", /audit_vendor\.operating_company_id = \$\{alias\}\.operating_company_id/, "TRUE"],
    ["customer-kind", "page", /customer:\s*"customer"/, 'customer: "vendor"'],
    ["vendor-kind", "page", /vendor:\s*"vendor"/, 'vendor: "customer"'],
    ["shared-drill", "page", /<EntityLink kind=\{kind\} id=\{row\.subject_id\} label=\{label\}/, "<span data-subject={row.subject_id}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...sources, [key]: sources[key].replace(pattern, replacement) };
    if (changed[key] === sources[key] || failures(changed).length === 0) {
      throw new Error(`${LABEL} SELFTEST FAIL — planted ${name} defect escaped`);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const problems = failures();
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Reports audit resolves scoped customer/vendor labels and canonical drills`);
