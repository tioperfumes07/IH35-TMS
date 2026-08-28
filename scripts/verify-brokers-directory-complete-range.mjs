#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["customer","connectivity","reverse_link","qbo_chrome"],"leaves":["names.brokers"],"task":"LST-F6920-BROKERS-DIRECTORY-COMPLETE-RANGE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "apps/frontend/src/pages/lists/names/BrokersListPage.tsx");

function verify(source) {
  const checks = [
    ["canonical exhaustive scanner import", /import \{ listAllCustomers, type Customer \} from "\.\.\/\.\.\/\.\.\/api\/mdata"/],
    ["canonical exhaustive scanner call", /listAllCustomers\(\{/],
    ["company scope", /operating_company_id:\s*companyId/],
    ["broker discriminator", /customer_type:\s*"broker"/],
    ["active lifecycle scope", /status:\s*"active"/],
    ["server search preserved", /search:\s*search \|\| undefined/],
    ["forward customer drill", /<EntityLink kind="customer" id=\{row\.id\}/],
    ["reverse route preserved", /navigate\(`\/customers\/\$\{row\.id\}`\)/],
    ["creator round-trip", /fixedCustomerType="broker"[\s\S]*onCreated=\{\(\) => \{[\s\S]*query\.refetch\(\)/],
    ["read failure visible and retryable", /Failed to load brokers\.[\s\S]*query\.refetch\(\)/],
    ["honest total uses exhausted rows", /Total brokers:\s*\{rows\.length\}/],
  ];
  const failures = checks.filter(([, pattern]) => !pattern.test(source)).map(([label]) => label);
  if (/\blistCustomers\(\{/.test(source)) failures.push("bounded listCustomers call remains");
  return failures;
}

const source = fs.readFileSync(pagePath, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`verify-brokers-directory-complete-range FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["bounded scanner", source.replace("listAllCustomers({", "listCustomers({")],
    ["cross-company", source.replace("operating_company_id: companyId", "operating_company_id: undefined")],
    ["wrong type", source.replace('customer_type: "broker"', 'customer_type: "customer"')],
    ["inactive leak", source.replace('status: "active"', 'status: "all"')],
    ["search disconnected", source.replace("search: search || undefined", "search: undefined")],
    ["dead forward link", source.replace('kind="customer"', 'kind="vendor"')],
    ["hidden read failure", source.replace("Failed to load brokers.", "")],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-brokers-directory-complete-range SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-brokers-directory-complete-range SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-brokers-directory-complete-range PASS — broker directory exhausts the scoped canonical customer population and preserves search/create/F+R/error truth");
