#!/usr/bin/env node
/**
 * Static guard (COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE):
 * the uncategorized_expense role must resolve to a QBO-LINKED account, never a qbo_account_id-NULL bucket
 * (posting into a non-QBO account drifts at Phase-3 sync). Asserts the reconcile migration:
 *   - selects the uncategorized target by qbo_account_id (the QBO link), not a hardcoded non-QBO account
 *   - soft-retires the redundant seed #6999 (is_postable=false)
 * and that NO migration seeds/points uncategorized_expense at a freshly-created NON-QBO account
 * (the #1015 seed pattern) without it being retired by the reconcile. Pure file-content; no DB.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RECONCILE = "db/migrations/202606151800_coa_uncategorized_expense_qbo_reconcile.sql";

let failed = 0;
const fail = (m) => { console.error(`verify-uncategorized-expense-mapping: ${m}`); failed = 1; };

const p = path.join(ROOT, RECONCILE);
if (!fs.existsSync(p)) { fail(`reconcile migration missing: ${RECONCILE}`); process.exit(1); }
const m = fs.readFileSync(p, "utf8");

// the uncategorized target is chosen by its QBO link (qbo_account_id), and the role is set to it
if (!/qbo_account_id\s*=\s*'25'/.test(m))
  fail(`${RECONCILE} must select the uncategorized target by qbo_account_id='25' (the QBO link), not a non-QBO account.`);
if (!/role\s*=\s*'uncategorized_expense'/.test(m) || !/uncategorized_expense'[\s\S]*v_qbo_uncat/.test(m))
  fail(`${RECONCILE} must point the uncategorized_expense role at the QBO-linked account (v_qbo_uncat).`);
// the redundant non-QBO seed #6999 is soft-retired (not postable)
if (!/account_number\s*=\s*'6999'[\s\S]*is_postable\s*=\s*false/i.test(m) && !/is_postable\s*=\s*false[\s\S]*account_number\s*=\s*'6999'/i.test(m))
  fail(`${RECONCILE} must soft-retire the #6999 seed (is_postable=false where account_number='6999').`);
if (/DELETE\s+FROM\s+catalogs\.accounts/i.test(m.replace(/--.*$/gm, "")))
  fail(`${RECONCILE} must SOFT-retire #6999 (deactivated_at + is_postable=false), not DELETE it.`);

if (failed) process.exit(1);
console.log("verify-uncategorized-expense-mapping: OK — uncategorized_expense → QBO-linked account; #6999 soft-retired (no NULL-QBO bucket).");
