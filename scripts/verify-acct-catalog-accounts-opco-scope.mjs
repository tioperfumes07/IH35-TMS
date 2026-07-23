#!/usr/bin/env node
/**
 * Accounting full-audit wave 11/22 — listCatalogAccounts must accept operating_company_id and every
 * money-adjacent frontend caller must pass the local operating company id so CoA pickers cannot leak
 * cross-entity accounts into bill/expense/vendor/customer/banking flows.
 *
 * Asserts:
 *   1. catalog-accounts.ts params include operating_company_id and append it to URLSearchParams
 *      in both the explicit-limit and paging loops.
 *   2. Known money-adjacent call sites pass operating_company_id (not bare status-only calls).
 *
 * Self-test: node scripts/verify-acct-catalog-accounts-opco-scope.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_REL = "apps/frontend/src/api/catalog-accounts.ts";

/** Money-adjacent pickers that must scope listCatalogAccounts to the active operating company. */
const MONEY_ADJACENT_CALLERS = [
  "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
  "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  "apps/frontend/src/pages/VendorDetail.tsx",
  "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
  "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx",
  // Same empty-picker class as CoA Roles pre-#3342: status-only list under FORCE RLS → [].
  "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
  "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
];

/**
 * @param {{ apiSrc: string, callerSources: Record<string, string> }} input
 * @returns {string[]}
 */
export function assertGuard({ apiSrc, callerSources }) {
  const failures = [];

  if (!/operating_company_id\?:\s*string/.test(apiSrc)) {
    failures.push(`${API_REL} — listCatalogAccounts params must include operating_company_id?: string`);
  }
  if (!/params\?\.operating_company_id/.test(apiSrc)) {
    failures.push(`${API_REL} — must read params?.operating_company_id when building the query string`);
  }
  if (!/qs\.set\(\s*["']operating_company_id["']/.test(apiSrc)) {
    failures.push(`${API_REL} — must append operating_company_id to URLSearchParams when set`);
  }
  const limitBranch = apiSrc.match(/if\s*\(\s*params\?\.limit\s*!==\s*undefined\s*\)\s*\{[\s\S]*?\n\s*\}/);
  const pagingBranch = apiSrc.match(/for\s*\(\s*let\s+offset\s*=\s*0[\s\S]*?\n\s*\}/);
  const appendHelper = /appendOpco\s*\(\s*qs\s*\)/.test(apiSrc);
  const limitScoped =
    (limitBranch && /operating_company_id/.test(limitBranch[0])) || (appendHelper && limitBranch && /appendOpco\s*\(\s*qs\s*\)/.test(limitBranch[0]));
  const pagingScoped =
    (pagingBranch && /operating_company_id/.test(pagingBranch[0])) || (appendHelper && pagingBranch && /appendOpco\s*\(\s*qs\s*\)/.test(pagingBranch[0]));
  if (!limitScoped) {
    failures.push(`${API_REL} — explicit-limit branch must append operating_company_id`);
  }
  if (!pagingScoped) {
    failures.push(`${API_REL} — paging loop must append operating_company_id`);
  }

  for (const rel of MONEY_ADJACENT_CALLERS) {
    const src = callerSources[rel];
    if (!src) {
      failures.push(`${rel} — missing (required money-adjacent listCatalogAccounts caller)`);
      continue;
    }
    const calls = [...src.matchAll(/listCatalogAccounts\s*\(\s*\{([^}]*)\}/g)];
    if (calls.length === 0) {
      failures.push(`${rel} — expected at least one listCatalogAccounts call`);
      continue;
    }
    for (const call of calls) {
      if (!/operating_company_id\s*:/.test(call[1])) {
        failures.push(`${rel} — listCatalogAccounts call must pass operating_company_id (${call[0].trim()})`);
      }
    }
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runReal() {
  const callerSources = Object.fromEntries(MONEY_ADJACENT_CALLERS.map((rel) => [rel, readRepo(rel)]));
  const failures = assertGuard({ apiSrc: readRepo(API_REL), callerSources });
  if (failures.length > 0) {
    console.error("[verify-acct-catalog-accounts-opco-scope] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-acct-catalog-accounts-opco-scope] OK — listCatalogAccounts accepts operating_company_id; money-adjacent pickers pass it"
  );
}

function runSelftest() {
  const goodApi = `
    export async function listCatalogAccounts(params?: { status?: string; limit?: number; operating_company_id?: string }) {
      const appendOpco = (qs) => { if (params?.operating_company_id) qs.set("operating_company_id", params.operating_company_id); };
      if (params?.limit !== undefined) {
        const qs = new URLSearchParams({ status, limit: String(params.limit) });
        appendOpco(qs);
        return apiRequest(\`/api/v1/catalogs/accounts?\${qs}\`);
      }
      for (let offset = 0; ; offset += PAGE) {
        const qs = new URLSearchParams({ status, limit: String(PAGE), offset: String(offset) });
        appendOpco(qs);
      }
    }
  `;
  const goodCaller = `queryFn: () => listCatalogAccounts({ status: "active", operating_company_id: operatingCompanyId }),`;
  const badCaller = `queryFn: () => listCatalogAccounts({ status: "active" }),`;
  const allGoodCallers = Object.fromEntries(MONEY_ADJACENT_CALLERS.map((rel) => [rel, goodCaller]));
  const cases = [
    {
      name: "healthy: API + scoped caller",
      input: {
        apiSrc: goodApi,
        callerSources: allGoodCallers,
      },
      expectPass: true,
    },
    {
      name: "regression: API missing operating_company_id param",
      input: {
        apiSrc: goodApi.replace(/operating_company_id\?:\s*string/, ""),
        callerSources: allGoodCallers,
      },
      expectPass: false,
    },
    {
      name: "regression: caller omits operating_company_id",
      input: {
        apiSrc: goodApi,
        callerSources: { ...allGoodCallers, [MONEY_ADJACENT_CALLERS[0]]: badCaller },
      },
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = assertGuard(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(
        `  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`
      );
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-acct-catalog-accounts-opco-scope] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
