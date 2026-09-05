#!/usr/bin/env node
/**
 * ACC-13 (docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md) — "A TEST-NAMED GL ACCOUNT holding
 * $1,200.00 on the balance sheet." Live re-verify (2026-09-05, CC-2) found the reported dollar
 * figure stale (owner's own register: "several may have moved since") but the underlying defect
 * far WORSE than reported: 22 active test/sample-fixture-named accounts in USMCA's live chart of
 * accounts (Driver Cash Advance / Driver Escrow pairs seeded by CC3/CODEX smoke runs, plus two
 * literal "ZZ-SAMPLE A/B ... GATEB_SAMPLE" accounts) — all $0 balance, 0 postings, confirmed live
 * before archiving. Archived (deactivated_at, void-not-delete) in the same pass. This script is
 * the re-run: confirms the count stays at zero and that catalogs.accounts' create route
 * (apps/backend/src/catalogs/accounts.routes.ts) now REJECTS a new test/sample/demo-named account
 * for USMCA outright (no is_sample_data column exists on this table to tag-and-allow, unlike
 * mdata.customers/vendors) rather than silently admitting another one.
 *
 * Target: Neon project tiny-field-89581227, branch br-fancy-credit-akjnd07a (prod). Read-only.
 * Usage: DATABASE_URL=<prod conn string, SET LOCAL app.bypass_rls done internally> \
 *        node scripts/verify-acc13-no-test-accounts-in-usmca-coa.mjs
 *        node scripts/verify-acc13-no-test-accounts-in-usmca-coa.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-acc13-no-test-accounts-in-usmca-coa";
const ROUTE_PATH = "apps/backend/src/catalogs/accounts.routes.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const SAMPLE_NAME_SQL_FRAGMENT = `(account_name ILIKE '%test%' OR account_name ILIKE '%sample%' OR account_name ILIKE '%battery%' OR account_name ILIKE '%fixture%' OR account_name ILIKE '%demo%' OR account_number ILIKE '%test%' OR account_number ILIKE '%sample%')`;

export function routeRejectsTestNamedUsmcaAccounts(routeSrc) {
  return (
    routeSrc.includes("looksLikeSampleDataName") &&
    routeSrc.includes("USMCA_COMPANY_ID") &&
    /__sample_name_rejected/.test(routeSrc) &&
    /operatingCompanyId === USMCA_COMPANY_ID/.test(routeSrc)
  );
}

function selftest() {
  const ok =
    routeRejectsTestNamedUsmcaAccounts(
      'import { looksLikeSampleDataName } from "x";\nconst USMCA_COMPANY_ID = "y";\nif (operatingCompanyId === USMCA_COMPANY_ID && looksLikeSampleDataName(x)) return { __sample_name_rejected: true };'
    ) === true &&
    routeRejectsTestNamedUsmcaAccounts("no guard here at all") === false;
  if (!ok) {
    console.error(`${LABEL}: SELFTEST FAIL — routeRejectsTestNamedUsmcaAccounts() wrong`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

// Static half: the create-route guard is present in source.
if (!fs.existsSync(ROUTE_PATH)) {
  console.error(`${LABEL}: FAIL — ${ROUTE_PATH} not found`);
  process.exit(1);
}
const routeSrc = fs.readFileSync(ROUTE_PATH, "utf8");
if (!routeRejectsTestNamedUsmcaAccounts(routeSrc)) {
  console.error(`${LABEL}: FAIL — ${ROUTE_PATH} no longer rejects test/sample/demo-named accounts for USMCA`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — create route rejects test/sample/demo-named USMCA accounts`);

// Live half: only runs with a real DATABASE_URL (prod or a branch) — never part of the CI ephemeral-DB
// suite (same convention as verify-gl-invariants.sql, which is psql-invoked, not auto-run in CI).
if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live re-count (static check above still ran).`);
  console.log(`${LABEL}: to re-run the live count: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const control = await client.query(`SELECT count(*)::int AS n FROM accounting.journal_entries`);
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — je_control=0, this connection cannot see the ledger (masked read, not a verdict)`);
    process.exit(1);
  }
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM catalogs.accounts WHERE operating_company_id = $1 AND deactivated_at IS NULL AND ${SAMPLE_NAME_SQL_FRAGMENT}`,
    [USMCA]
  );
  await client.query("ROLLBACK");
  const n = rows[0].n;
  if (n !== 0) {
    console.error(`${LABEL}: FAIL — ${n} active test/sample-named account(s) still in USMCA's live chart of accounts (je_control=${control.rows[0].n})`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — 0 active test/sample-named accounts in USMCA's live chart of accounts (je_control=${control.rows[0].n})`);
} finally {
  await client.end();
}
