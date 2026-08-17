#!/usr/bin/env node
/**
 * verify-payments-deposited-to-account-safe-cast.mjs
 *
 * ACCT-F5406 — accounting.payments.deposited_to_account_id is TEXT while catalogs.accounts.id is
 * UUID (same identity-space-mismatch class already fixed once this session for
 * accounting.vendor_credits.vendor_id — ACCT-F5405). Postgres has no `uuid = text` operator, so the
 * naive join `dep_acct.id = p.deposited_to_account_id` in fetchPaymentDetail() made
 * `/accounting/payments/:id` a 500 on every real call — confirmed live (browser showed
 * "Couldn't load payment — Error: operator does not exist: uuid = text") and reproduced/fixed
 * directly against Neon prod schema.
 *
 * Fix follows the same safe-cast rule vendor-identity.ts documents: cast the always-valid uuid
 * column (`dep_acct.id::text`), never the arbitrary text column.
 *
 * Guards against regressing back to the bare, type-mismatched join.
 */
import { readFileSync } from "node:fs";

const path = "apps/backend/src/accounting/payments.routes.ts";
const src = readFileSync(path, "utf8");

const failures = [];

const joinLines = [...src.matchAll(/LEFT JOIN catalogs\.accounts dep_acct\s*\n\s*ON\s+(\S+)\s*=\s*p\.deposited_to_account_id/g)];
if (joinLines.length === 0) {
  failures.push("expected 'LEFT JOIN catalogs.accounts dep_acct ON ... = p.deposited_to_account_id' — query shape changed, re-check this guard");
}
for (const m of joinLines) {
  const leftSide = m[1];
  if (leftSide !== "dep_acct.id::text") {
    failures.push(
      `join predicate uses '${leftSide} = p.deposited_to_account_id' — must be 'dep_acct.id::text = p.deposited_to_account_id' ` +
      `(p.deposited_to_account_id is TEXT, dep_acct.id is UUID; Postgres has no uuid = text operator — this 500s live)`
    );
  }
}

if (/p\.deposited_to_account_id::uuid/.test(src)) {
  failures.push("found 'p.deposited_to_account_id::uuid' — never cast the deposited_to_account_id text column to uuid, cast dep_acct.id to text instead");
}

if (failures.length > 0) {
  console.error("verify-payments-deposited-to-account-safe-cast: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-payments-deposited-to-account-safe-cast: OK — catalogs.accounts join casts dep_acct.id::text (never p.deposited_to_account_id::uuid)");
