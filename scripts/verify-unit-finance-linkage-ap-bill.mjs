#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["ap_bill"],"leafRe":"^unit\\.detail\\.finance_linkage$","task":"ACCT-F5159-UNIT-FINANCE-LINKAGE-AP-BILL"} */
/**
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): unit.detail.finance_linkage
 * (UnitFinanceLinkageTab.tsx) genuinely owns ap_bill — it's a real reverse Unit→Bill drill
 * (ACCT-F04 / ACCT-LINK-03), backed end to end:
 *   - backend: GET /api/v1/accounting/units/:id/linked-financials (bills.routes.ts) →
 *     listUnitLinkedFinancials (bills.service.ts) — tenant + unit_id scoped SELECT against
 *     accounting.bills, revoked_at IS NULL, joined to its posted journal entry.
 *   - frontend: listUnitLinkedFinancials (api/accounting.ts) → UnitFinanceLinkageTab.tsx renders
 *     each linked bill as a real EntityLink kind="bill".
 *
 * Self-test: node scripts/verify-unit-finance-linkage-ap-bill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-finance-linkage-ap-bill";

const FILES = {
  service: "apps/backend/src/accounting/bills.service.ts",
  routes: "apps/backend/src/accounting/bills.routes.ts",
  tab: "apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx",
};

export function audit(src) {
  const failures = [];
  const fnMatch = /export async function listUnitLinkedFinancials[\s\S]{0,3000}/.exec(src.service);
  const fnBody = fnMatch ? fnMatch[0] : "";
  if (!/WHERE b\.operating_company_id = \$1::uuid[\s\S]{0,80}AND b\.unit_id = \$2/.test(fnBody)) {
    failures.push(`${FILES.service}: listUnitLinkedFinancials must scope accounting.bills by operating_company_id AND unit_id`);
  }
  if (!/units\/:id\/linked-financials/.test(src.routes)) {
    failures.push(`${FILES.routes}: unit linked-financials route must be registered`);
  }
  if (!/canAccessAccounting\(String\(user\.role[\s\S]{0,600}units\/:id\/linked-financials|units\/:id\/linked-financials[\s\S]{0,400}canAccessAccounting/.test(src.routes)) {
    failures.push(`${FILES.routes}: unit linked-financials route must be access-gated`);
  }
  if (!/listUnitLinkedFinancials\(unitId, companyId\)/.test(src.tab)) {
    failures.push(`${FILES.tab}: tab must call listUnitLinkedFinancials for the current unit`);
  }
  if (!/EntityLink kind="bill" id=\{b\.id\}/.test(src.tab)) {
    failures.push(`${FILES.tab}: linked bills must render a real EntityLink kind="bill"`);
  }
  if (!/to=\{`\/accounting\/bills\?unit_id=\$\{encodeURIComponent\(unitId\)\}`\}[\s\S]{0,120}Open Bills/.test(src.tab)) {
    failures.push(`${FILES.tab}: Open Bills must preserve the current unit_id filter`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
    routes: fs.readFileSync(path.join(root, FILES.routes), "utf8"),
    tab: fs.readFileSync(path.join(root, FILES.tab), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["service-scope", "service", /AND b\.unit_id = \$2/, "AND false"],
    ["route-registered", "routes", /units\/:id\/linked-financials/g, "units/:id/unused-route"],
    ["tab-call", "tab", /listUnitLinkedFinancials\(unitId, companyId\)/, "listSomethingElse(unitId, companyId)"],
    ["tab-entitylink", "tab", /EntityLink kind="bill" id=\{b\.id\}/, 'span'],
    ["tab-open-bills-filter", "tab", /\/accounting\/bills\?unit_id=\$\{encodeURIComponent\(unitId\)\}/, "/accounting/bills"],
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

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — unit.detail.finance_linkage's Unit→Bill reverse drill is real, tenant+unit scoped`);
