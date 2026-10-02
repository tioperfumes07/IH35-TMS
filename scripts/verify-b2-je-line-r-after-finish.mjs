#!/usr/bin/env node
/**
 * B-2 Finish → register ✓ = R for JE-only register_cleared postings (ORDERS §6 / QBO SPEC §6).
 * No migration: read-model derives R when register_cleared + bank ledger under a closed
 * reconciliation_session period. Complete still stamps only bank_transactions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-b2-je-line-r-after-finish";

const SERVICE = "apps/backend/src/accounting/account-register.service.ts";
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(src, needle, where) {
  if (src.includes(needle)) throw new Error(`${where}: must not contain ${JSON.stringify(needle)}`);
}

function main() {
  const service = read(SERVICE);
  const routes = read(ROUTES);

  // List CASE: JE-only R after bank-match R, before plain C.
  assertIncludes(service, "B-2 Finish→R", SERVICE);
  assertIncludes(service, "ba.ledger_account_id = p.account_id", SERVICE);
  assertIncludes(service, "rs.status = 'reconciled'", SERVICE);
  assertIncludes(service, "je.entry_date BETWEEN rs.period_start AND rs.period_end", SERVICE);
  assertIncludes(service, "WHEN COALESCE(p.register_cleared, false)", SERVICE);
  assertIncludes(service, "THEN 'R'", SERVICE);

  // Toggle + inline save lock derived JE R.
  assertIncludes(service, "je_session_reconciled", SERVICE);
  assertIncludes(service, "derivedJeR", SERVICE);
  assertIncludes(service, 'throw new AccountRegisterToggleError("reconcile_status_locked"', SERVICE);

  // Complete path: still bank_transactions only — no posting session column / no SET register_cleared.
  assertIncludes(routes, "UPDATE banking.bank_transactions", ROUTES);
  assertIncludes(routes, "reconciliation_session_id = $1", ROUTES);
  assertIncludes(routes, "JE-only R", ROUTES);
  assertNotIncludes(routes, "SET register_cleared", ROUTES);
  assertNotIncludes(routes, "journal_entry_postings\n          SET\n            reconciliation_session_id", ROUTES);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
