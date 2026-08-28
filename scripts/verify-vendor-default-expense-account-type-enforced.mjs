#!/usr/bin/env node
/**
 * VEND-F-VENDOR-CREATE-ACCEPTS-ASSET-AS-DEFAULT-EXPENSE-ACCT ratchet.
 *
 * QUERY-BACK (GO-0010, CC-3, 2026-08-28): the create/edit UI pickers (VendorCreateModal.tsx,
 * VendorDetail.tsx) already filter their candidate account list to `account_type === "Expense"` —
 * that part of the original finding was NOT reproducible; both filters have existed since #2199. But
 * that is a client-side convenience only: `POST /api/v1/mdata/vendors` and
 * `PATCH /api/v1/mdata/vendors/:id` accepted ANY account UUID for `default_expense_account_id` with no
 * server-side type check. Not hypothetical — live proof on prod: two vendors
 * (`DEVIN-ASSET-DEFAULT-TEST`, `DEVIN-ASSET-DEFAULT-TEST-2`) carry an Asset-type "Driver Cash Advance"
 * account as their default expense account today.
 *
 * This guard fails the build if the create or update route ever again writes
 * `default_expense_account_id` without first calling the shared account-type check, so a future
 * refactor of vendors.routes.ts can't silently drop the guard the way its absence let this happen the
 * first time.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/vendors.routes.ts";
const CHECK_FN = "checkDefaultExpenseAccountIsExpenseType";

const src = readFileSync(join(repoRoot, TARGET), "utf8");
const failures = [];

if (!new RegExp(`function\\s+${CHECK_FN}\\s*\\(`).test(src)) {
  failures.push(`${TARGET}: no \`${CHECK_FN}\` helper — the server-side account-type check was removed.`);
}
if (!/account_type\s*===\s*"Expense"/.test(src)) {
  failures.push(`${TARGET}: no Expense-type comparison found — the check's own logic was gutted.`);
}

// Every write of default_expense_account_id (the create INSERT column list, the update SET builder)
// must sit textually AFTER a call to the check helper, so a future refactor that reorders the route
// body can't skip straight to the write.
const writeMarkers = [
  'addOptional("default_expense_account_id"',
  'add("default_expense_account_id"',
];
let checkedWrites = 0;
for (const marker of writeMarkers) {
  let idx = 0;
  while ((idx = src.indexOf(marker, idx)) !== -1) {
    checkedWrites += 1;
    const before = src.slice(0, idx);
    if (!before.includes(`${CHECK_FN}(`)) {
      const line = before.split("\n").length;
      failures.push(
        `${TARGET}:${line}: writes default_expense_account_id with no preceding ${CHECK_FN}(...) call in the route body.`
      );
    }
    idx += marker.length;
  }
}

if (checkedWrites === 0) {
  failures.push(`${TARGET}: no default_expense_account_id write call sites found — guard is stale, re-point it.`);
}

if (failures.length > 0) {
  console.error("FAIL verify-vendor-default-expense-account-type-enforced");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `PASS verify-vendor-default-expense-account-type-enforced — ${checkedWrites} write site(s), all gated by ${CHECK_FN}`
);
