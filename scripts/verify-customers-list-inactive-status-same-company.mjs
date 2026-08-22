#!/usr/bin/env node
/**
 * ACCT-F5789 — CUSTOMERS-LIST-INACTIVE-FILTER-CONTRADICTS-RLS. mdata.customers' customers_select RLS
 * requires deactivated_at IS NULL for any non-bypass reader, directly contradicting the customers LIST
 * endpoint's own status=inactive filter (deactivated_at IS NOT NULL) — status=inactive always returned
 * 0 rows for a real user regardless of real data. Compounded by EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL
 * ("archived_at IS NULL"), applied unconditionally to every request — archived_at and deactivated_at
 * are stamped together by the same deactivate-customer write path (confirmed live), so status=inactive
 * was doubly impossible to satisfy.
 *
 * Live-verified as the real ih35_app runtime role (current_user confirmed in the same query):
 * broken=0 / fixed=13 for USMCA's real deactivated customers.
 *
 * Same class as ACCT-F5767/5768/5787/5788 — reuses the identical SECURITY DEFINER pattern, mirrors
 * mdata.list_vendors_same_company (ACCT-F5768) exactly. customers_select itself untouched.
 *
 * INVARIANT (static — no database): the customers LIST endpoint must (1) skip
 * EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL specifically when status === "inactive", (2) route the
 * status=inactive branch's FROM clause through mdata.list_customers_same_company, and (3) the
 * migration creating that function must be SECURITY DEFINER, same-company scoped, ih35_app-only
 * EXECUTE — and never touch customers_select.
 *
 * Self-test: node scripts/verify-customers-list-inactive-status-same-company.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/mdata/customers.routes.ts";
const MIGRATIONS_DIR = "db/migrations";
const LABEL = "verify-customers-list-inactive-status-same-company";

function latestCustomersSameCompanyListMigration() {
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+mdata\.list_customers_same_company/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkRouteSource(src) {
  const problems = [];
  if (!/const filters: string\[\] = status === "inactive" \? \[\] : \[EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL\]/.test(src)) {
    problems.push("EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL is no longer conditionally skipped for status=inactive — the double-contradiction with deactivated_at IS NOT NULL would return");
  }
  if (!/mdata\.list_customers_same_company\(\$1::uuid\)/.test(src)) {
    problems.push("status=inactive no longer routes through mdata.list_customers_same_company — the RLS contradiction would return");
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }

  const migrationFile = latestCustomersSameCompanyListMigration();
  if (!migrationFile) {
    problems.push("no migration found defining mdata.list_customers_same_company");
  } else {
    const migrationSrc = fs.readFileSync(path.join(ROOT, MIGRATIONS_DIR, migrationFile), "utf8");
    if (!/SECURITY DEFINER/.test(migrationSrc)) problems.push(`${migrationFile}: mdata.list_customers_same_company is not SECURITY DEFINER`);
    if (!/c\.operating_company_id = p_operating_company_id/.test(migrationSrc)) problems.push(`${migrationFile}: resolver does not scope by operating_company_id`);
    if (!/GRANT EXECUTE ON FUNCTION mdata\.list_customers_same_company\(uuid\) TO ih35_app/.test(migrationSrc)) problems.push(`${migrationFile}: EXECUTE not granted to ih35_app`);
    if (/GRANT EXECUTE ON FUNCTION mdata\.list_customers_same_company\(uuid\) TO PUBLIC/.test(migrationSrc)) problems.push(`${migrationFile}: EXECUTE granted to PUBLIC`);
  }

  return problems;
}

function selftest() {
  const goodSrc = `
    const filters: string[] = status === "inactive" ? [] : [EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL];
    if (status === "active") filters.push("deactivated_at IS NULL");
    if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
    const fromClause = status === "inactive" ? "mdata.list_customers_same_company($1::uuid)" : "mdata.customers";
  `;
  const cases = [
    { name: "good route", src: goodSrc, expectProblems: false },
    {
      name: "EXCLUDE_ARCHIVED reverted to unconditional",
      src: goodSrc.replace(
        `const filters: string[] = status === "inactive" ? [] : [EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL];`,
        `const filters: string[] = [EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL];`
      ),
      expectProblems: true,
    },
    {
      name: "fromClause reverted to always mdata.customers",
      src: goodSrc.replace(
        `const fromClause = status === "inactive" ? "mdata.list_customers_same_company($1::uuid)" : "mdata.customers";`,
        `const fromClause = "mdata.customers";`
      ),
      expectProblems: true,
    },
    {
      name: "customers_select weakened directly (forbidden shortcut)",
      src: goodSrc + `\nALTER TABLE mdata.customers customers_select ...;`,
      expectProblems: true,
    },
    {
      name: "customers_select dropped (forbidden shortcut)",
      src: goodSrc + `\nDROP POLICY customers_select ON mdata.customers;`,
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkRouteSource(c.src);
    const srcOnlyProblems = problems.filter((p) => !/\.sql:/.test(p));
    const hasProblems = srcOnlyProblems.length > 0;
    const ok = hasProblems === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(srcOnlyProblems)}`);
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const src = fs.readFileSync(path.join(ROOT, ROUTE_FILE), "utf8");
  const problems = checkRouteSource(src);
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — customers LIST status=inactive routes through the same-company resolver, EXCLUDE_ARCHIVED conditionally skipped, customers_select untouched`);
}

main();
