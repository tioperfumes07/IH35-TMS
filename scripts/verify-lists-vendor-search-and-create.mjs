#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["vendor"],"leafRe":"^(hub\\.names_search|lists\\.drawer\\.new_vendor_drawer_form)$","task":"LINK-F5166-LISTS-VENDOR-SEARCH-CREATE"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): of the 122 lists leaves flagged
 * vendor, only 2 are genuine — the other 120 are pure catalog-VALUE CRUD (same generic
 * MaintenanceCatalogListPage/useCatalogQuery.ts pattern already confirmed for fleet/customer
 * catalogs), never a vendor RECORD — even catalog.maintenance.vendors.list, which only outbound-links
 * to a separate hub route. hub.names_search (NamesMasterHub.tsx) is a real cross-module search
 * rendering EntityLink kind="vendor" for vendor rows; lists.drawer.new_vendor_drawer_form
 * (NewVendorDrawerForm.tsx) calls the canonical createVendor().
 *
 * Self-test: node scripts/verify-lists-vendor-search-and-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  namesHub: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
  newVendor: "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx",
};
const LABEL = "verify-lists-vendor-search-and-create";

export function audit(src) {
  const failures = [];
  if (!/kind=\{kind\}/.test(src.namesHub)) {
    failures.push(`${FILES.namesHub}: names search must render a real per-row dynamic-kind EntityLink`);
  }
  if (!/vendor:\s*"vendor"/.test(src.namesHub)) {
    failures.push(`${FILES.namesHub}: names search must have a real vendor entity-type mapping`);
  }
  if (!/createVendor\(/.test(src.newVendor)) {
    failures.push(`${FILES.newVendor}: must call the canonical createVendor on submit`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    namesHub: fs.readFileSync(path.join(root, FILES.namesHub), "utf8"),
    newVendor: fs.readFileSync(path.join(root, FILES.newVendor), "utf8"),
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
    ["vendor-mapping", "namesHub", /vendor:\s*"vendor"/, 'vendor: "vendor_unused"'],
    ["create-call", "newVendor", /createVendor\(/g, "createSomethingElse("],
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
console.log(`${LABEL} PASS — names search and vendor create-drawer are genuinely vendor-scoped`);
