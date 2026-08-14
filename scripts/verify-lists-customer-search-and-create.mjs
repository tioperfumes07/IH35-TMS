#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["customer"],"leafRe":"^(hub\\.names_search|lists\\.drawer\\.new_customer_drawer_form)$","task":"LINK-F5165-LISTS-CUSTOMER-SEARCH-CREATE"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): of the 68 lists leaves flagged
 * customer, only 2 are genuine — the other 66 are pure catalog-VALUE CRUD (dropdown option
 * management, same generic useCatalogQuery.ts pattern already confirmed for fleet in the trailer
 * sweep), never a customer RECORD. hub.names_search (NamesMasterHub.tsx) is a real cross-module
 * search rendering EntityLink kind="customer" for customer rows; lists.drawer.new_customer_drawer_form
 * (NewCustomerDrawerForm.tsx) calls the canonical createCustomer().
 *
 * Self-test: node scripts/verify-lists-customer-search-and-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  namesHub: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
  newCustomer: "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
};
const LABEL = "verify-lists-customer-search-and-create";

export function audit(src) {
  const failures = [];
  if (!/kind=\{kind\}/.test(src.namesHub)) {
    failures.push(`${FILES.namesHub}: names search must render a real per-row dynamic-kind EntityLink`);
  }
  if (!/key:\s*"customer",\s*label:\s*"Customers"/.test(src.namesHub)) {
    failures.push(`${FILES.namesHub}: names search must have a real customer entity-type filter`);
  }
  if (!/createCustomer\(/.test(src.newCustomer)) {
    failures.push(`${FILES.newCustomer}: must call the canonical createCustomer on submit`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    namesHub: fs.readFileSync(path.join(root, FILES.namesHub), "utf8"),
    newCustomer: fs.readFileSync(path.join(root, FILES.newCustomer), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["dynamic-kind-link", "namesHub", /kind=\{kind\}/, 'kind="unit"'],
    ["customer-filter", "namesHub", /key:\s*"customer",\s*label:\s*"Customers"/, 'key: "customer_x", label: "Customers"'],
    ["create-call", "newCustomer", /createCustomer\(/g, "createSomethingElse("],
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
console.log(`${LABEL} PASS — names search and customer create-drawer are genuinely customer-scoped`);
