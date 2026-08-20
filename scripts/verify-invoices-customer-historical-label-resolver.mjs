#!/usr/bin/env node
/**
 * verify-invoices-customer-historical-label-resolver.mjs
 *
 * ACCT-F5611 — LV-INVOICES-LIST-SHOWS-30-OF-37. mdata.customers' own customers_select RLS policy
 * (FORCE ROW LEVEL SECURITY) excludes any deactivated_at IS NOT NULL row for a non-bypass reader.
 * That is correct for active-only pickers/rosters but wrong for a HISTORICAL FK reference — an
 * invoice that already cites a customer must keep listing/resolving after that customer is
 * deactivated, not silently vanish. Confirmed live: USMCA has 37 accounting.invoices rows, 7 of
 * which cite a deactivated customer; the plain (INNER) JOIN dropped all 7 from the list, the count,
 * AND 404'd their own detail pages.
 *
 * FIX AT THE CANONICAL BOUNDARY: migration 202612811500 adds
 * mdata.resolve_customer_label_same_company (SECURITY DEFINER, same-company-only, label-only),
 * mirroring mdata.resolve_vendor_label_same_company (202612780000, guarded by
 * verify-inventory-vendor-historical-label-resolver.mjs) exactly. It does NOT touch the
 * customers_select policy, so active-only pickers/rosters are unchanged.
 *
 * Guards:
 *  1. The migration exists, is idempotent-shaped (CREATE OR REPLACE), grants EXECUTE to ih35_app
 *     only (never PUBLIC), is SECURITY DEFINER, and scopes by operating_company_id.
 *  2. invoices.routes.ts's list/count query, single-invoice detail query, and the load->invoices
 *     reverse-drill query all LEFT JOIN mdata.customers (not a plain/INNER JOIN) and use the
 *     resolver as a COALESCE fallback for customer_name.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const failures = [];

const migrationFiles = readdirSync("db/migrations").filter((f) => f.startsWith("202612811500_"));
if (migrationFiles.length !== 1) {
  failures.push(`expected exactly 1 migration file starting with 202612811500_, found ${migrationFiles.length}`);
} else {
  const migrationPath = `db/migrations/${migrationFiles[0]}`;
  const migrationSrc = readFileSync(migrationPath, "utf8");
  if (!/CREATE OR REPLACE FUNCTION mdata\.resolve_customer_label_same_company/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing CREATE OR REPLACE FUNCTION mdata.resolve_customer_label_same_company (idempotency)`);
  }
  if (!/SECURITY DEFINER/.test(migrationSrc)) {
    failures.push(`${migrationPath}: resolver function is no longer SECURITY DEFINER`);
  }
  if (!/REVOKE ALL ON FUNCTION mdata\.resolve_customer_label_same_company\(uuid, uuid\) FROM PUBLIC/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing REVOKE ALL ... FROM PUBLIC — function must not be world-executable`);
  }
  if (!/GRANT EXECUTE ON FUNCTION mdata\.resolve_customer_label_same_company\(uuid, uuid\) TO ih35_app/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing GRANT EXECUTE ... TO ih35_app`);
  }
  if (!/AND c\.operating_company_id = p_operating_company_id/.test(migrationSrc)) {
    failures.push(`${migrationPath}: resolver no longer scopes by operating_company_id — cross-company label leak risk`);
  }
}

const routesPath = "apps/backend/src/accounting/invoices.routes.ts";
const src = readFileSync(routesPath, "utf8");

const resolverCallCount = (src.match(/mdata\.resolve_customer_label_same_company\(/g) || []).length;
if (resolverCallCount < 4) {
  failures.push(
    `${routesPath}: expected >=4 mdata.resolve_customer_label_same_company(...) call(s) (count/list, ` +
      `detail, bill_to_entity_label, load-invoices reverse-drill), found ${resolverCallCount}`
  );
}

const innerJoinCustomers = (src.match(/\n\s*JOIN mdata\.customers c\b/g) || []).length;
if (innerJoinCustomers > 0) {
  failures.push(
    `${routesPath}: found ${innerJoinCustomers} plain (INNER) JOIN mdata.customers c — every invoice ` +
      `query must LEFT JOIN so a deactivated customer's invoice doesn't silently vanish`
  );
}

const leftJoinCustomers = (src.match(/LEFT JOIN mdata\.customers c\b/g) || []).length;
if (leftJoinCustomers < 4) {
  failures.push(`${routesPath}: expected >=4 LEFT JOIN mdata.customers c occurrences, found ${leftJoinCustomers}`);
}

if (failures.length > 0) {
  console.error("verify-invoices-customer-historical-label-resolver: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-invoices-customer-historical-label-resolver: OK — canonical same-company customer resolver exists (SECURITY DEFINER, ih35_app-only grant), invoices.routes.ts LEFT JOINs mdata.customers with the resolver as a COALESCE fallback everywhere it reads a customer"
);
