#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CUSTOMER_ROUTE_FILE = path.join(ROOT, "apps", "backend", "src", "mdata", "customers.routes.ts");
const SELFTEST = process.argv.includes("--selftest");

if (!fs.existsSync(CUSTOMER_ROUTE_FILE)) {
  console.error("verify:customers-tenant-scope — FAILED\n- apps/backend/src/mdata/customers.routes.ts not found");
  process.exit(1);
}

const text = fs.readFileSync(CUSTOMER_ROUTE_FILE, "utf8");

function collectProblems(source) {
  const problems = [];
  const listRoute = source.match(/app\.get\("\/api\/v1\/mdata\/customers"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
  if (!listRoute) problems.push("could not locate customers list route");
  if (!/set_config\('app\.operating_company_id'/.test(listRoute)) {
    problems.push("customers list route must set app.operating_company_id");
  }
  if (!/operating_company_id\s*=\s*\$\$\{values\.length\}/.test(listRoute)) {
    problems.push("customers list query must include operating_company_id filter");
  }

  const detailRoute = source.match(/app\.get\("\/api\/v1\/mdata\/customers\/:id"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
  if (!detailRoute) problems.push("could not locate customers detail route");
  if (!/resolveOperatingCompanyId\(client, authUser\.uuid, parsedQuery\.data\.operating_company_id\)/.test(detailRoute)) {
    problems.push("customers detail route must resolve requested company membership");
  }
  if (!/set_config\('app\.operating_company_id',[\s\S]{0,100}resolvedOperatingCompanyId/.test(detailRoute)) {
    problems.push("customers detail route must install resolved company scope");
  }
  if (!/FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) LIMIT 1/.test(detailRoute)) {
    problems.push("customers detail query must use the canonical id + company resolver");
  }

  const detailExpandedRoute = source.match(/app\.get\("\/api\/v1\/mdata\/customers\/:id\/detail"[\s\S]*?\n  \}\);/m)?.[0] ?? "";
  if (!detailExpandedRoute) problems.push("could not locate customers expanded detail route");
  if (!/FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) c\s+LIMIT 1/.test(detailExpandedRoute)) {
    problems.push("customers expanded detail query must use the canonical id + company resolver");
  }
  return problems;
}

const problems = collectProblems(text);
if (problems.length) {
  console.error("verify:customers-tenant-scope — FAILED");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

if (SELFTEST) {
  const mutations = [
    text.replace("operating_company_id = $${values.length}::uuid", "TRUE /* planted list tenant leak */"),
    text.replace("resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)", "resolveOperatingCompanyId(client, authUser.uuid)"),
    text.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1", "FROM mdata.customers WHERE id = $1::uuid LIMIT 1"),
    text.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid) c", "FROM mdata.customers c /* planted expanded detail leak */"),
  ];
  const escaped = mutations.filter((candidate) => collectProblems(candidate).length === 0);
  if (escaped.length) {
    console.error(`verify:customers-tenant-scope SELFTEST FAILED — ${escaped.length}/${mutations.length} planted defects escaped`);
    process.exit(1);
  }
  console.log(`verify:customers-tenant-scope SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
}

console.log("verify:customers-tenant-scope — OK (list + canonical detail resolver + expanded detail scope)");
