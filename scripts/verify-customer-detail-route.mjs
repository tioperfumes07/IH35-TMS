#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const files = {
  index: "apps/backend/src/index.ts",
  mdataCustomers: "apps/backend/src/mdata/customers.routes.ts",
  customersIndex: "apps/backend/src/customers/index.ts",
  detailRoutes: "apps/backend/src/customers/detail.routes.ts",
  resolver: "db/migrations/202613060000_acct_f5787_customer_same_company_full_row_resolver.sql",
};

function readSources() {
  return Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(repoRoot, file), "utf8")]));
}

function detailBlock(source) {
  const start = source.indexOf('app.get("/api/v1/mdata/customers/:id/detail"');
  const end = source.indexOf('app.patch("/api/v1/mdata/customers/:id"', start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function evaluate(sources) {
  const failures = [];
  const block = detailBlock(sources.mdataCustomers);
  if (!sources.index.includes("registerMdataRoutes")) failures.push("index.ts must register mdata routes");
  if (!sources.index.includes("registerCustomerRoutes(app)") || !sources.index.includes('./customers/index.js"')) {
    failures.push("index.ts must register canonical /api/v1/customers routes");
  }
  if (!block) failures.push("mdata customers.routes.ts must expose GET /api/v1/mdata/customers/:id/detail");
  if (!/FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) c\s+LIMIT 1/.test(block)) {
    failures.push("mdata customer detail must resolve the row through get_customer_same_company(id, selected company)");
  }
  if (!/\[parsedParams\.data\.id, resolvedOperatingCompanyId\]/.test(block)) {
    failures.push("mdata customer detail must bind id and resolved selected-company scope in that order");
  }
  if (!block.includes("mdata.customers.detail_viewed")) failures.push("mdata customer detail route must audit detail_viewed reads");
  if (!sources.customersIndex.includes("registerCustomerDetailRoutes")) failures.push("customers/index.ts must wire registerCustomerDetailRoutes");
  if (!sources.detailRoutes.includes('app.get("/api/v1/customers/:id/detail"')) failures.push("customers/detail.routes.ts must expose GET /api/v1/customers/:id/detail");
  if (!/LANGUAGE sql\s+SECURITY DEFINER/.test(sources.resolver)) failures.push("customer same-company resolver must remain SECURITY DEFINER");
  if (!/WHERE c\.id = p_customer_id\s+AND c\.operating_company_id = p_operating_company_id/.test(sources.resolver)) {
    failures.push("customer same-company resolver must bind both customer id and operating company id");
  }
  if (!/REVOKE ALL ON FUNCTION mdata\.get_customer_same_company\(uuid, uuid\) FROM PUBLIC/.test(sources.resolver)) {
    failures.push("customer same-company resolver must not be executable by PUBLIC");
  }
  return failures;
}

const live = readSources();
const failures = evaluate(live);
if (failures.length > 0) {
  console.error("verify:customer-detail-route — FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["direct customer-table read", "mdataCustomers", (s) => s.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid) c", "FROM mdata.customers c")],
    ["swapped selected-company binding", "mdataCustomers", (s) => {
      const block = detailBlock(s);
      return s.replace(block, block.replace("[parsedParams.data.id, resolvedOperatingCompanyId]", "[resolvedOperatingCompanyId, parsedParams.data.id]"));
    }],
    ["resolver loses SECURITY DEFINER", "resolver", (s) => s.replace("LANGUAGE sql\nSECURITY DEFINER", "LANGUAGE sql\nSECURITY INVOKER")],
    ["resolver loses company predicate", "resolver", (s) => s.replace("AND c.operating_company_id = p_operating_company_id", "AND true /* planted cross-company leak */")],
    ["resolver grants PUBLIC", "resolver", (s) => s.replace("REVOKE ALL ON FUNCTION mdata.get_customer_same_company(uuid, uuid) FROM PUBLIC", "GRANT EXECUTE ON FUNCTION mdata.get_customer_same_company(uuid, uuid) TO PUBLIC")],
  ];
  let caught = 0;
  for (const [name, key, mutate] of mutations) {
    const planted = { ...live, [key]: mutate(live[key]) };
    if (evaluate(planted).length > 0) caught += 1;
    else console.error(`SELFTEST missed: ${name}`);
  }
  if (caught !== mutations.length) process.exit(1);
  console.log(`verify:customer-detail-route — selftest ${caught}/${mutations.length} planted defects rejected`);
}

console.log("verify:customer-detail-route — OK");
