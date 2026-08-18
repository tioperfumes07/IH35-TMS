#!/usr/bin/env node
/**
 * verify-inventory-vendor-historical-label-resolver.mjs
 *
 * LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL — mdata.vendors' own vendors_select RLS
 * policy (FORCE ROW LEVEL SECURITY) excludes any deactivated_at IS NOT NULL row for a non-bypass
 * reader. That is correct for active-only pickers/rosters but wrong for a HISTORICAL FK reference —
 * a part that already cites a vendor must keep showing that vendor's name after it's deactivated,
 * not "Vendor — not visible". Confirmed live: production part 780c71a9-... cites deactivated vendor
 * 2cbaf657-... ("P42-VENDOR-FK-20260811"); the plain LEFT JOIN silently drops it.
 *
 * FIX AT THE CANONICAL BOUNDARY: migration 202612780000 adds mdata.resolve_vendor_label_same_company
 * (SECURITY DEFINER, same-company-only, label-only, same trusted pattern audit.tg_audit_row() already
 * uses at scale) as a reusable fallback any vendor-bearing historical reader can call — it does NOT
 * touch the vendors_select policy, so active-only pickers/rosters are unchanged.
 *
 * Guards:
 *  1. The migration exists, is idempotent-shaped (CREATE OR REPLACE), grants EXECUTE to ih35_app
 *     only (never PUBLIC), and is SECURITY DEFINER.
 *  2. Both known vendor-bearing readers of maintenance.parts_inventory (parts.routes.ts — the real
 *     live repro consumed by InventoryPartsStockPage.tsx — and parts-inventory.routes.ts, including
 *     its two parts_purchases endpoints) call the resolver as a COALESCE fallback on the LEFT JOIN,
 *     not as a replacement for it (active vendors must keep resolving via the fast join, unchanged).
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const failures = [];

const migrationFiles = readdirSync("db/migrations").filter((f) => f.startsWith("202612780000_"));
if (migrationFiles.length !== 1) {
  failures.push(`expected exactly 1 migration file starting with 202612780000_, found ${migrationFiles.length}`);
} else {
  const migrationPath = `db/migrations/${migrationFiles[0]}`;
  const migrationSrc = readFileSync(migrationPath, "utf8");
  if (!/CREATE OR REPLACE FUNCTION mdata\.resolve_vendor_label_same_company/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing CREATE OR REPLACE FUNCTION mdata.resolve_vendor_label_same_company (idempotency)`);
  }
  if (!/SECURITY DEFINER/.test(migrationSrc)) {
    failures.push(`${migrationPath}: resolver function is no longer SECURITY DEFINER`);
  }
  if (!/REVOKE ALL ON FUNCTION mdata\.resolve_vendor_label_same_company\(uuid, uuid\) FROM PUBLIC/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing REVOKE ALL ... FROM PUBLIC — function must not be world-executable`);
  }
  if (!/GRANT EXECUTE ON FUNCTION mdata\.resolve_vendor_label_same_company\(uuid, uuid\) TO ih35_app/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing GRANT EXECUTE ... TO ih35_app`);
  }
  if (!/AND v\.operating_company_id = p_operating_company_id/.test(migrationSrc)) {
    failures.push(`${migrationPath}: resolver no longer scopes by operating_company_id — cross-company label leak risk`);
  }
}

const readers = [
  { path: "apps/backend/src/maintenance/parts.routes.ts", calls: 1, alias: "pi" },
  { path: "apps/backend/src/maintenance/parts-inventory.routes.ts", calls: 3, alias: null },
];
for (const { path: readerPath, calls, alias } of readers) {
  const src = readFileSync(readerPath, "utf8");
  const genericPattern = /COALESCE\(v\.vendor_name, mdata\.resolve_vendor_label_same_company\((pi|pp)\.vendor_id, \1\.operating_company_id\)\)/g;
  const matchCount = (src.match(genericPattern) || []).length;
  if (matchCount < calls) {
    failures.push(`${readerPath}: expected >=${calls} COALESCE resolver fallback call(s) on the vendor LEFT JOIN, found ${matchCount}`);
  }
  if (alias && !new RegExp(`\\b${alias}\\.vendor_id\\b`).test(src)) {
    failures.push(`${readerPath}: expected alias "${alias}" no longer present`);
  }
  if (!/LEFT JOIN mdata\.vendors v/.test(src)) {
    failures.push(`${readerPath}: the base LEFT JOIN to mdata.vendors is gone — active vendors must keep resolving via the fast join, not the resolver alone`);
  }
}

if (failures.length > 0) {
  console.error("verify-inventory-vendor-historical-label-resolver: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-inventory-vendor-historical-label-resolver: OK — canonical same-company resolver exists (SECURITY DEFINER, ih35_app-only grant), both known parts_inventory vendor-bearing readers use it as a COALESCE fallback on the unchanged active-vendor join"
);
