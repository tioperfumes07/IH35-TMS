#!/usr/bin/env node
/**
 * CI GUARD — UI-1 Accounting Modules: no ComingSoonPage stubs
 *
 * Fails if any of the 3 built UI-1 accounting module pages still render <ComingSoonPage>.
 * Also verifies the manifest routes for these pages are NOT using ComingSoonPage inline.
 *
 * Run: node scripts/verify-ui1-no-stub-accounting-modules.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PAGES = [
  "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
  "apps/frontend/src/pages/accounting/ReceiptsPage.tsx",
  "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx",
];

const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const ROUTES_MUST_NOT_BE_STUB = [
  "/accounting/integration-transactions",
  "/accounting/receipts",
  "/accounting/prepaid-expenses",
];

let failed = false;

// 1. Pages must NOT contain <ComingSoonPage />
for (const rel of PAGES) {
  const content = readFileSync(resolve(root, rel), "utf8");
  if (content.includes("<ComingSoonPage")) {
    console.error(`FAIL: ${rel} still renders <ComingSoonPage />`);
    failed = true;
  } else {
    console.log(`OK:   ${rel} — no stub`);
  }
}

// 2. Manifest routes must point to real components (not ComingSoonPage inline)
const manifestContent = readFileSync(resolve(root, MANIFEST), "utf8");
for (const route of ROUTES_MUST_NOT_BE_STUB) {
  // Find the Route element line for this path
  const lineMatch = manifestContent.split("\n").find((line) => line.includes(`path="${route}"`));
  if (!lineMatch) {
    console.error(`FAIL: ${MANIFEST} — route "${route}" not found`);
    failed = true;
  } else if (lineMatch.includes("ComingSoonPage")) {
    console.error(`FAIL: ${MANIFEST} route "${route}" still uses ComingSoonPage: ${lineMatch.trim()}`);
    failed = true;
  } else {
    console.log(`OK:   manifest route "${route}" — real component`);
  }
}

// 3. Backend routes must exist
const BACKEND_ROUTES = [
  "apps/backend/src/accounting/integration-transactions.routes.ts",
  "apps/backend/src/accounting/receipts.routes.ts",
  "apps/backend/src/accounting/prepaid-expenses.routes.ts",
];

for (const rel of BACKEND_ROUTES) {
  try {
    const content = readFileSync(resolve(root, rel), "utf8");
    if (content.length < 200) {
      console.error(`FAIL: ${rel} — file too short (stub?)`);
      failed = true;
    } else {
      console.log(`OK:   ${rel} — backend route exists`);
    }
  } catch {
    console.error(`FAIL: ${rel} — file not found`);
    failed = true;
  }
}

// 4. Migration must exist
const MIGRATION = "db/migrations/202606271610_prepaid_expenses_data_model.sql";
try {
  const content = readFileSync(resolve(root, MIGRATION), "utf8");
  if (!content.includes("prepaid_assets") || !content.includes("prepaid_amortization_rows")) {
    console.error(`FAIL: ${MIGRATION} — missing expected tables`);
    failed = true;
  } else {
    console.log(`OK:   ${MIGRATION} — prepaid_assets + prepaid_amortization_rows present`);
  }
} catch {
  console.error(`FAIL: ${MIGRATION} — file not found`);
  failed = true;
}

if (failed) {
  console.error("\n❌ UI-1 accounting module guard FAILED — fix stubs before merge.");
  process.exit(1);
} else {
  console.log("\n✅ UI-1 accounting module guard PASSED — no stubs, all routes wired.");
}
