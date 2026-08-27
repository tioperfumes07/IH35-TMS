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
const DETAIL_FILE = "apps/frontend/src/pages/VendorDetail.tsx";
const MDATA_API = "apps/frontend/src/api/mdata.ts";

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

  const vendorsPatchIdx = vendorsText.indexOf('app.patch("/api/v1/mdata/vendors/:id"');
  const vendorsDeactivateStart = vendorsText.indexOf('app.post("/api/v1/mdata/vendors/:id/deactivate"');
  const vendorsPatchBlock =
    vendorsPatchIdx >= 0
      ? vendorsText.slice(
          vendorsPatchIdx,
          vendorsDeactivateStart > vendorsPatchIdx ? vendorsDeactivateStart : vendorsPatchIdx + 4000,
        )
      : "";
  if (!/\? withLuciaBypass\(\(bypassClient\) => bypassClient\.query\(sql, params\)/.test(vendorsPatchBlock)) {
    failures.push(`${VENDORS_FILE} PATCH no longer uses withLuciaBypass when body includes deactivated_at (Reactivate 404)`);
  }

  const vendorsReactivateIdx = vendorsText.indexOf("/api/v1/mdata/vendors/:id/reactivate");
  const vendorsReactivateBlock = vendorsReactivateIdx >= 0 ? vendorsText.slice(vendorsReactivateIdx, vendorsReactivateIdx + 3500) : "";
  if (vendorsReactivateIdx < 0) {
    failures.push(`${VENDORS_FILE} POST /reactivate route missing`);
  }
  if (!/await withLuciaBypass\(/.test(vendorsReactivateBlock)) {
    failures.push(`${VENDORS_FILE} reactivate route no longer wraps SELECT/UPDATE in withLuciaBypass()`);
  }
  if (!/SET deactivated_at = NULL[\s\S]*?AND operating_company_id = \$3::uuid/.test(vendorsReactivateBlock)) {
    failures.push(`${VENDORS_FILE} reactivate UPDATE no longer clears deactivated_at with explicit operating_company_id WHERE match`);
  }

  return failures;
}

function checkFrontend(detailText, apiText) {
  const failures = [];
  if (!/mutationFn: \(\) => reactivateVendor\(id\)/.test(detailText)) {
    failures.push(`${DETAIL_FILE} Reactivate is not POST reactivateVendor(id) — silent PATCH 404 will return`);
  }
  if (!/mutationFn: \(\) => deactivateVendor\(id\)/.test(detailText)) {
    failures.push(`${DETAIL_FILE} Inactivate is not POST deactivateVendor(id)`);
  }
  if (!/export function reactivateVendor\(id: string\)/.test(apiText)) {
    failures.push(`${MDATA_API} reactivateVendor helper missing`);
  }
  if (!/\/api\/v1\/mdata\/vendors\/\$\{id\}\/reactivate/.test(apiText)) {
    failures.push(`${MDATA_API} reactivateVendor does not POST /reactivate`);
  }
  return failures;
}

function run() {
  const customersText = fs.readFileSync(path.join(root, CUSTOMERS_FILE), "utf8");
  const vendorsText = fs.readFileSync(path.join(root, VENDORS_FILE), "utf8");
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const apiText = fs.readFileSync(path.join(root, MDATA_API), "utf8");
  const failures = [...check(customersText, vendorsText), ...checkFrontend(detailText, apiText)];
  if (failures.length > 0) {
    console.error("FAIL: mdata-deactivate-rls-bypass-wrap");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: mdata.customers and mdata.vendors deactivate+reactivate wrap writes in withLuciaBypass(); VendorDetail uses POST /deactivate and /reactivate");
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

  const offenderPatch = vendorsText.replace(
    'const queryVendor = (sql: string, params: unknown[]) =>\n          "deactivated_at" in b\n            ? withLuciaBypass((bypassClient) => bypassClient.query(sql, params), { actorUserId: authUser.uuid })\n            : client.query(sql, params);',
    "const queryVendor = (sql: string, params: unknown[]) => client.query(sql, params);",
  );
  if (offenderPatch === vendorsText) {
    console.error("FAIL(selftest): offender mutation did not change vendor PATCH queryVendor — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(customersText, offenderPatch);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (PATCH deactivated_at no longer lucia) was NOT caught");
    process.exit(1);
  }

  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const apiText = fs.readFileSync(path.join(root, MDATA_API), "utf8");
  const offenderFe = detailText.replace("mutationFn: () => reactivateVendor(id)", "mutationFn: () => updateVendor(id, { deactivated_at: null })");
  if (offenderFe === detailText) {
    console.error("FAIL(selftest): offender mutation did not change VendorDetail Reactivate — pattern out of sync");
    process.exit(1);
  }
  const failuresD = checkFrontend(offenderFe, apiText);
  if (failuresD.length === 0) {
    console.error("FAIL(selftest): planted VendorDetail PATCH reactivate was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
