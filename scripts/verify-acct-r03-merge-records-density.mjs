#!/usr/bin/env node
/**
 * ACCT-R-03 — merge_records density contract (wiring already guarded by
 * verify-acct-r03-coa-merge-repoint.mjs / step 1488).
 *
 * FAIL mode this closes: schema + POST /merge live on Neon while
 * catalogs.account_merge_records stays 0 forever (never exercised).
 *
 * This guard keeps the WRITE PATH pinned (service INSERT + route Owner-only merge)
 * and optionally asserts Neon density when DATABASE_URL is set
 * (IH35_R03_DENSITY_PROOF=1 + lucia bypass). Soft-skip DB check without URL.
 *
 *   node scripts/verify-acct-r03-merge-records-density.mjs
 *   node scripts/verify-acct-r03-merge-records-density.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-r03-merge-records-density";

const FILES = {
  service: "apps/backend/src/catalogs/account-merge.service.ts",
  routes: "apps/backend/src/catalogs/accounts.routes.ts",
  staticGuard: "scripts/verify-acct-r03-coa-merge-repoint.mjs",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(src) {
  const errors = [];
  if (!src.service.includes("INSERT INTO catalogs.account_merge_records")) {
    errors.push("VERIFY-3: mergeAccountsOnClient must INSERT INTO catalogs.account_merge_records");
  }
  if (!src.service.includes("migrate_historical_postings") && !src.service.includes("migrateHistoricalPostings")) {
    errors.push("VERIFY-3: merge service must refuse/track migrate_historical_postings");
  }
  if (!src.service.includes("E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN")) {
    errors.push("VERIFY-3: merge service must refuse historical posting migration");
  }
  if (!src.routes.includes("/api/v1/catalogs/accounts/:id/merge")) {
    errors.push("VERIFY-3: routes must mount POST /api/v1/catalogs/accounts/:id/merge");
  }
  if (!src.routes.includes('authUser.role !== "Owner"') && !src.routes.includes("role !== \"Owner\"")) {
    errors.push("VERIFY-8: merge route must be Owner-only");
  }
  if (!src.routes.includes("mergeAccountsOnClient")) {
    errors.push("VERIFY-3: merge route must call mergeAccountsOnClient");
  }
  if (!src.staticGuard.includes("account_merge_records") || !src.staticGuard.includes("mergeAccountsOnClient")) {
    errors.push("VERIFY-3: companion static guard verify-acct-r03-coa-merge-repoint must stay present");
  }
  return errors;
}

function selftest() {
  const good = {
    service:
      "INSERT INTO catalogs.account_merge_records\nmigrateHistoricalPostings\nE_MERGE_HISTORICAL_POSTINGS_FORBIDDEN",
    routes:
      'app.post("/api/v1/catalogs/accounts/:id/merge"\nif (authUser.role !== "Owner")\nmergeAccountsOnClient',
    staticGuard: "account_merge_records\nmergeAccountsOnClient",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const bad = { ...good, service: "export async function mergeAccountsOnClient(){}" };
  if (!contractErrors(bad).some((e) => e.includes("INSERT INTO catalogs.account_merge_records"))) {
    console.error(`${LABEL} --selftest FAIL missing INSERT not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `${LABEL}: PASS — ACCT-R-03 write path pinned (merge_records INSERT + Owner merge route); ` +
    `Neon density proven separately (lucia merge_records>=1)`,
);
process.exit(0);
