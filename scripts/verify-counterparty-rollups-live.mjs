#!/usr/bin/env node
/**
 * CC-3 V.1 / Wave 3 Step 3 — vendor counterparty roll-up guard.
 *
 * Verifies the full vertical slice is wired:
 *   1. vendor-rollups.routes.ts exists and has the GET endpoint
 *   2. VendorsListView.tsx uses the rollups data (not just "—" placeholders)
 *   3. Vendors.tsx fetches the rollups via useQuery
 *   4. The API function (getVendorRollups) exists in mdata.ts
 *   5. purchases_ytd uses formatUsdCents (not a raw number)
 *   6. last_purchase uses mmmDd (not toLocaleDateString)
 *
 * Static source check — no DB needed.
 */
import fs from "node:fs";

const ROLLUPS_ROUTE = "apps/backend/src/mdata/vendor-rollups.routes.ts";
const MDATA_INDEX = "apps/backend/src/mdata/index.ts";
const MDATA_API = "apps/frontend/src/api/mdata.ts";
const VENDORS_PAGE = "apps/frontend/src/pages/Vendors.tsx";
const VENDORS_LIST_VIEW = "apps/frontend/src/pages/vendors/VendorsListView.tsx";

let failures = 0;

function fail(msg) {
  console.error(`FAIL verify-counterparty-rollups-live: ${msg}`);
  failures += 1;
}

// 1. Backend route file exists and has the endpoint
function checkRollupsRoute(src) {
  if (!src.includes("/api/v1/mdata/vendor-rollups")) {
    fail(`${ROLLUPS_ROUTE}: GET /api/v1/mdata/vendor-rollups endpoint not found.`);
  }
  if (!src.includes("purchases_ytd_cents")) {
    fail(`${ROLLUPS_ROUTE}: purchases_ytd_cents field not found in the query.`);
  }
  if (!src.includes("purchases_total_cents")) {
    fail(`${ROLLUPS_ROUTE}: purchases_total_cents field not found in the query.`);
  }
  if (!src.includes("last_purchase_date")) {
    fail(`${ROLLUPS_ROUTE}: last_purchase_date field not found in the query.`);
  }
  if (!src.includes("expense_count")) {
    fail(`${ROLLUPS_ROUTE}: expense_count field not found in the query.`);
  }
  if (!src.includes("voided_at IS NULL")) {
    fail(`${ROLLUPS_ROUTE}: voided_at IS NULL filter not found (voided expenses must be excluded).`);
  }
  if (!src.includes("vendor_uuid IS NOT NULL")) {
    fail(`${ROLLUPS_ROUTE}: vendor_uuid IS NOT NULL filter not found.`);
  }
}

// 2. Route is mounted in mdata/index.ts
function checkMdataIndex(src) {
  if (!src.includes("vendor-rollups")) {
    fail(`${MDATA_INDEX}: vendor-rollups route not mounted.`);
  }
  if (!src.includes("registerVendorRollupsRoutes")) {
    fail(`${MDATA_INDEX}: registerVendorRollupsRoutes not called.`);
  }
}

// 3. API function exists in mdata.ts
function checkMdataApi(src) {
  if (!src.includes("getVendorRollups")) {
    fail(`${MDATA_API}: getVendorRollups function not found.`);
  }
  if (!src.includes("VendorRollup")) {
    fail(`${MDATA_API}: VendorRollup type not found.`);
  }
  if (!src.includes("/api/v1/mdata/vendor-rollups")) {
    fail(`${MDATA_API}: vendor-rollups endpoint path not found.`);
  }
}

// 4. Vendors.tsx fetches rollups
function checkVendorsPage(src) {
  if (!src.includes("getVendorRollups")) {
    fail(`${VENDORS_PAGE}: getVendorRollups import/call not found.`);
  }
  if (!src.includes("vendor-rollups") || !src.includes("vendorRollupsQuery")) {
    fail(`${VENDORS_PAGE}: useQuery for vendor rollups not found.`);
  }
  if (!src.includes("rollupByVendorId")) {
    fail(`${VENDORS_PAGE}: rollupByVendorId map not built.`);
  }
  if (!src.includes("rollupByVendorId={rollupByVendorId}")) {
    fail(`${VENDORS_PAGE}: rollupByVendorId prop not passed to VendorsListView.`);
  }
}

// 5. VendorsListView.tsx uses rollups data (not just "—" placeholders)
function checkVendorsListView(src) {
  if (!src.includes("rollupByVendorId")) {
    fail(`${VENDORS_LIST_VIEW}: rollupByVendorId prop not accepted.`);
  }
  if (!src.includes("VendorRollup")) {
    fail(`${VENDORS_LIST_VIEW}: VendorRollup type import not found.`);
  }
  // purchases_ytd must use formatUsdCents (via fmtMoney), not a raw number
  if (!src.match(/purchases_ytd.*formatUsdCents|fmtMoney.*purchases_ytd|rollup\?\.purchases_ytd_cents/g)) {
    fail(`${VENDORS_LIST_VIEW}: purchases_ytd does not use rollup data.`);
  }
  // The old placeholder render: () => <span className="text-gray-400">—</span> for purchases_ytd must be gone
  const ytdPlaceholderMatch = src.match(/key:\s*"purchases_ytd"[\s\S]*?render:\s*\(\)\s*=>\s*<span[^>]*>—<\/span>/);
  if (ytdPlaceholderMatch) {
    fail(`${VENDORS_LIST_VIEW}: purchases_ytd still uses a "—" placeholder render.`);
  }
  // last_purchase must use mmmDd, not toLocaleDateString
  if (src.includes("toLocaleDateString")) {
    fail(`${VENDORS_LIST_VIEW}: toLocaleDateString found — must use mmmDd instead.`);
  }
  if (!src.match(/last_purchase_date.*mmmDd|mmmDd.*last_purchase_date|rollup\?\.last_purchase_date/g)) {
    fail(`${VENDORS_LIST_VIEW}: last_purchase does not use mmmDd with rollup data.`);
  }
  // The old placeholder for last_purchase must be gone
  const lastPurchasePlaceholderMatch = src.match(/key:\s*"last_purchase"[\s\S]*?render:\s*\(\)\s*=>\s*<span[^>]*>—<\/span>/);
  if (lastPurchasePlaceholderMatch) {
    fail(`${VENDORS_LIST_VIEW}: last_purchase still uses a "—" placeholder render.`);
  }
  // Last Transaction column must use rollup data, not a bare "—" placeholder
  const lastTxnPlaceholderMatch = src.match(/key:\s*"updated_at"[\s\S]*?render:\s*\(\)\s*=>\s*<span[^>]*>—<\/span>/);
  if (lastTxnPlaceholderMatch) {
    fail(`${VENDORS_LIST_VIEW}: Last Transaction still uses a "—" placeholder render.`);
  }
}

// --- Run checks ---
const files = [
  [ROLLUPS_ROUTE, checkRollupsRoute],
  [MDATA_INDEX, checkMdataIndex],
  [MDATA_API, checkMdataApi],
  [VENDORS_PAGE, checkVendorsPage],
  [VENDORS_LIST_VIEW, checkVendorsListView],
];

for (const [file, check] of files) {
  if (!fs.existsSync(file)) {
    fail(`${file}: file not found.`);
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  check(src);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("OK verify-counterparty-rollups-live: all checks passed.");
  process.exit(0);
}
