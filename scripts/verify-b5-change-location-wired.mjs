#!/usr/bin/env node
/**
 * BANK-F91052 — B-5 Change location wired end-to-end (ORDERS §B-5).
 * Asserts: JEP location_id migration, reclassify to_location_id path, FE picker live (not stub),
 * MatchDrawer resolve-difference location on bank_transaction_splits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-b5-change-location-wired";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(src, needle, where) {
  if (src.includes(needle)) throw new Error(`${where}: still contains stub ${JSON.stringify(needle)}`);
}

function main() {
  const migJep = read("db/migrations/202615262000_jep_reclassify_location_id.sql");
  assertIncludes(migJep, "journal_entry_postings", "202615262000");
  assertIncludes(migJep, "ADD COLUMN IF NOT EXISTS location_id", "202615262000");
  assertIncludes(migJep, "to_location_id", "202615262000");
  assertIncludes(migJep, "from_location_id", "202615262000");
  assertIncludes(migJep, "mdata.locations", "202615262000");

  const migSplit = read("db/migrations/202615221400_bank_transaction_splits_location_id.sql");
  assertIncludes(migSplit, "bank_transaction_splits", "202615221400");
  assertIncludes(migSplit, "ADD COLUMN IF NOT EXISTS location_id", "202615221400");

  const je = read("apps/backend/src/accounting/journal-entries.service.ts");
  assertIncludes(je, "location_id", "journal-entries.service");
  assertIncludes(je, "posting.location_id ?? null", "journal-entries.service");

  const svc = read("apps/backend/src/accounting/reclassify/reclassify.service.ts");
  assertIncludes(svc, "to_location_id", "reclassify.service");
  assertIncludes(svc, "p.location_id", "reclassify.service");
  assertIncludes(svc, "reclassify_target_location_not_found", "reclassify.service");
  assertIncludes(svc, "location_id: target.to_location_id", "reclassify.service");

  const routes = read("apps/backend/src/accounting/reclassify/reclassify.routes.ts");
  assertIncludes(routes, "to_location_id", "reclassify.routes");

  const page = read("apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx");
  assertIncludes(page, 'data-b5-change-location="1"', "ReclassifyTransactionsPage");
  assertIncludes(page, "FuelStopLocationPicker", "ReclassifyTransactionsPage");
  assertIncludes(page, "to_location_id: toLocation", "ReclassifyTransactionsPage");
  assertIncludes(page, 'data-testid="reclassify-to-location"', "ReclassifyTransactionsPage");
  // BANK-F91430 — ORDERS §B-5 left pane PERIOD BALANCES chrome (From/To + label).
  assertIncludes(page, 'data-b5-period-balances="1"', "ReclassifyTransactionsPage");
  assertIncludes(page, 'data-b5-period-from-to="1"', "ReclassifyTransactionsPage");
  assertIncludes(page, "Accounts · period balances", "ReclassifyTransactionsPage");
  assertNotIncludes(page, "not available yet", "ReclassifyTransactionsPage");
  assertNotIncludes(page, "Location is not a posting column", "ReclassifyTransactionsPage");

  const api = read("apps/frontend/src/api/reclassify.ts");
  assertIncludes(api, "to_location_id?", "reclassify.ts");

  const splits = read("apps/backend/src/banking/bank-transaction-splits.service.ts");
  assertIncludes(splits, "location_id?: string | null", "bank-transaction-splits.service");
  assertIncludes(splits, "location_id,", "bank-transaction-splits.service INSERT");

  const drawer = read("apps/frontend/src/pages/banking/components/MatchDrawer.tsx");
  assertIncludes(drawer, 'data-b3-resolve-location="1"', "MatchDrawer");
  assertIncludes(drawer, "location_id: r.locationId", "MatchDrawer");
  assertNotIncludes(drawer, "Location is not on the split engine yet", "MatchDrawer");

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  // BANK-F91430 plant — ORDERS §B-5 period-balances label must be catchable if drifted.
  const page = read("apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx");
  const planted = page.replace("Accounts · period balances", "Accounts · balances from the ledger");
  if (planted === page || planted.includes("Accounts · period balances")) {
    console.error(`${LABEL}: SELFTEST FAIL — period-balances plant inert`);
    process.exit(1);
  }
  if (!planted.includes("Accounts · balances from the ledger")) {
    console.error(`${LABEL}: SELFTEST FAIL — period-balances plant did not land`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
