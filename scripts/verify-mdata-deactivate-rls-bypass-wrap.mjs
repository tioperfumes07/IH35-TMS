#!/usr/bin/env node
// MDATA-DEACTIVATE-RLS-500 — guard
//
// POST /api/v1/mdata/customers/:id/deactivate and POST /api/v1/mdata/vendors/:id/deactivate both threw
// a live 500 ("new row violates row-level security policy") when writing `deactivated_at`, even though
// the customers_update policy's WITH CHECK predicate evaluates objectively TRUE as a plain SELECT in the
// identical transaction/role/GUC context immediately before the failing UPDATE (live-diagnosed across 3
// prior passes; board row CUSTOMER-INACTIVATE-500-DEAD-END). The fix wraps ONLY the deactivating UPDATE
// in withLuciaBypass(), with entity scope enforced by an explicit `operating_company_id = $N::uuid`
// WHERE-clause match (bound to an already membership-checked company id) rather than by RLS, since
// withLuciaBypass's own GUC override sets app.operating_company_id to a SENTINEL, not the real value.
// This guard fails if either route's UPDATE reverts to a plain (non-bypassed) client.query call, or if
// the WHERE clause's explicit operating_company_id match is dropped.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const CUSTOMERS_FILE = "apps/backend/src/mdata/customers.routes.ts";
const VENDORS_FILE = "apps/backend/src/mdata/vendors.routes.ts";

export function check(customersText, vendorsText) {
  const failures = [];

  if (!/import \{ withCurrentUser, withLuciaBypass \} from "\.\.\/auth\/db\.js";/.test(customersText)) {
    failures.push(`${CUSTOMERS_FILE} no longer imports withLuciaBypass alongside withCurrentUser`);
  }
  if (!/import \{ withCurrentUser, withLuciaBypass \} from "\.\.\/auth\/db\.js";/.test(vendorsText)) {
    failures.push(`${VENDORS_FILE} no longer imports withLuciaBypass alongside withCurrentUser`);
  }

  const customersDeactivateIdx = customersText.indexOf("/api/v1/mdata/customers/:id/deactivate");
  const customersBlock = customersDeactivateIdx >= 0 ? customersText.slice(customersDeactivateIdx, customersDeactivateIdx + 3500) : "";
  if (!/await withLuciaBypass\(/.test(customersBlock)) {
    failures.push(`${CUSTOMERS_FILE} deactivate route no longer wraps the UPDATE in withLuciaBypass()`);
  }
  if (!/UPDATE mdata\.customers SET deactivated_at = now\(\)[\s\S]*?AND operating_company_id = \$3::uuid/.test(customersBlock)) {
    failures.push(`${CUSTOMERS_FILE} deactivate UPDATE no longer scopes by an explicit operating_company_id WHERE match`);
  }
  if (!/\{ actorUserId: authUser\.uuid \}/.test(customersBlock)) {
    failures.push(`${CUSTOMERS_FILE} withLuciaBypass call no longer passes actorUserId for audit attribution`);
  }

  const vendorsDeactivateIdx = vendorsText.indexOf('"/api/v1/mdata/vendors/:id/deactivate"');
  const vendorsBlock = vendorsDeactivateIdx >= 0 ? vendorsText.slice(vendorsDeactivateIdx, vendorsDeactivateIdx + 4000) : "";
  if (!/await withLuciaBypass\(/.test(vendorsBlock)) {
    failures.push(`${VENDORS_FILE} deactivate route no longer wraps the UPDATE in withLuciaBypass()`);
  }
  if (!/UPDATE mdata\.vendors\s*SET deactivated_at = now\(\)[\s\S]*?AND operating_company_id = \$3::uuid/.test(vendorsBlock)) {
    failures.push(`${VENDORS_FILE} deactivate UPDATE no longer scopes by an explicit operating_company_id WHERE match`);
  }
  if (!/set_config\('app\.operating_company_id', \$1::text, true\)/.test(vendorsBlock)) {
    failures.push(`${VENDORS_FILE} deactivate route no longer sets app.operating_company_id (hygiene gap Devin originally flagged)`);
  }
  if (!/\{ actorUserId: authUser\.uuid \}/.test(vendorsBlock)) {
    failures.push(`${VENDORS_FILE} withLuciaBypass call no longer passes actorUserId for audit attribution`);
  }

  return failures;
}

function run() {
  const customersText = fs.readFileSync(path.join(root, CUSTOMERS_FILE), "utf8");
  const vendorsText = fs.readFileSync(path.join(root, VENDORS_FILE), "utf8");
  const failures = check(customersText, vendorsText);
  if (failures.length > 0) {
    console.error("FAIL: mdata-deactivate-rls-bypass-wrap");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: mdata.customers and mdata.vendors deactivate routes both wrap the deactivating UPDATE in withLuciaBypass() with explicit entity-scoped WHERE clauses");
}

function selftest() {
  const customersText = fs.readFileSync(path.join(root, CUSTOMERS_FILE), "utf8");
  const vendorsText = fs.readFileSync(path.join(root, VENDORS_FILE), "utf8");

  const offenderCustomers = customersText.replace(
    /const res = await withLuciaBypass\(\s*\(bypassClient\) =>\s*bypassClient\.query\(\s*`UPDATE mdata\.customers SET deactivated_at = now\(\), updated_by_user_id = \$2 WHERE id = \$1 AND operating_company_id = \$3::uuid AND deactivated_at IS NULL RETURNING id, deactivated_at`,\s*\[parsedParams\.data\.id, authUser\.uuid, scopedCompanyId\]\s*\),\s*\{ actorUserId: authUser\.uuid \}\s*\);/,
    `const res = await client.query(
          \`UPDATE mdata.customers SET deactivated_at = now(), updated_by_user_id = $2 WHERE id = $1 AND operating_company_id = $3::uuid AND deactivated_at IS NULL RETURNING id, deactivated_at\`,
          [parsedParams.data.id, authUser.uuid, scopedCompanyId]
        );`,
  );
  if (offenderCustomers === customersText) {
    console.error("FAIL(selftest): offender mutation did not change customers.routes.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderCustomers, vendorsText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (customers UPDATE reverted to non-bypassed client.query) was NOT caught");
    process.exit(1);
  }

  const offenderVendors = vendorsText.replace("await withLuciaBypass(", "await Promise.resolve(");
  if (offenderVendors === vendorsText) {
    console.error("FAIL(selftest): offender mutation did not change vendors.routes.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(customersText, offenderVendors);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (vendors withLuciaBypass call removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
