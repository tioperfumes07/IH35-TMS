#!/usr/bin/env node
// GUARD (Rule 16 — every bug fix gets a static guard): the settlement / driver / fuel / period-close
// posters MUST resolve their role→GL-account via the CoA-roles resolver (PRIMARY
// accounting.chart_of_accounts_roles first, legacy catalogs.account_role_bindings as a fallback tier),
// NOT by reading the (empty in prod) legacy binding table directly. This locks the root-cause fix:
// posting failed closed because role keys resolved ONLY from catalogs.account_role_bindings (0 rows).
//
// It FAILS if any production poster file below contains a `FROM catalogs.account_role_bindings`
// role→account resolution (the resolver owns that legacy read now). A `JOIN catalogs.account_role_bindings`
// is ALLOWED: the DIP bank-account bridge in the bill-payment poster legitimately joins the cash_dip
// binding to banking.bank_accounts to resolve a BANK ACCOUNT (not a role→GL account) and has no resolver
// equivalent. Tests are out of scope (they may still seed/read the legacy table to prove the fallback tier).
//
// Run: node scripts/verify-settlement-posters-use-coa-resolver.mjs [--selftest]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// The 5 production poster files that previously resolved role→GL-account from the empty legacy table.
const TARGET_FILES = [
  "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  "apps/backend/src/accounting/posting-engine.service.ts",
  "apps/backend/src/accounting/fuel-posting/poster.service.ts",
  "apps/backend/src/accounting/period-close-retained-earnings.service.ts",
  // Residual after #3109 — pay-run close was still reading the empty legacy bindings table directly.
  "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
];

// `FROM catalogs.account_role_bindings` = a direct role→account resolution read (forbidden in posters).
// A `JOIN catalogs.account_role_bindings` (the DIP cash_dip bank bridge) is intentionally NOT matched.
const FORBIDDEN = /\bFROM\s+catalogs\.account_role_bindings\b/i;

function checkContent(content) {
  // Return the 1-based line numbers that contain a forbidden direct legacy role→account read.
  const hits = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (FORBIDDEN.test(lines[i])) hits.push(i + 1);
  }
  return hits;
}

function selftest() {
  const bad = "  const x = `SELECT arb.account_id FROM catalogs.account_role_bindings arb WHERE role_key=$1`;";
  const goodJoin = "  JOIN catalogs.account_role_bindings arb ON arb.account_id = ba.ledger_account_id";
  const goodResolver = "  const acct = await resolveRoleAccountOptional(client, opco, 'driver_pay_expense');";
  const failures = [];
  if (checkContent(bad).length !== 1) failures.push("detector did NOT flag a direct FROM catalogs.account_role_bindings read");
  if (checkContent(goodJoin).length !== 0) failures.push("detector WRONGLY flagged a JOIN catalogs.account_role_bindings bridge");
  if (checkContent(goodResolver).length !== 0) failures.push("detector WRONGLY flagged a resolver call");
  if (failures.length > 0) {
    console.error("verify-settlement-posters-use-coa-resolver SELFTEST FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-settlement-posters-use-coa-resolver selftest passed");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const offenders = [];
  for (const rel of TARGET_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`verify-settlement-posters-use-coa-resolver: expected file missing: ${rel}`);
      process.exit(1);
    }
    const hits = checkContent(fs.readFileSync(abs, "utf8"));
    if (hits.length > 0) offenders.push({ rel, hits });
  }
  if (offenders.length > 0) {
    console.error(
      "verify-settlement-posters-use-coa-resolver FAILED: posters must resolve role→GL-account via the\n" +
        "CoA-roles resolver (resolveRoleAccount/resolveRoleAccountOptional), not a direct\n" +
        "`FROM catalogs.account_role_bindings` read. Offending files/lines:"
    );
    for (const o of offenders) console.error(` - ${o.rel}: line(s) ${o.hits.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlement-posters-use-coa-resolver passed (${TARGET_FILES.length} poster files clean)`);
}

main();
