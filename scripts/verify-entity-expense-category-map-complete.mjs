#!/usr/bin/env node
/**
 * GUARD — ACCT-F98: an active operating entity must carry an expense-side category map, and the
 * per-driver sub-account creator must not depend on QuickBooks to number its accounts.
 *
 * THE DEFECT (live, USMCA 2026-08-02 18:41 CT): a vendor bill SAVED and did not post. The poster ran
 * and refused, leaving an honest audit row —
 *   accounting.bill.gl_post_failed / BILL_LINE_ACCOUNT_UNRESOLVED
 *   "Category maintenance/maintenance has no active expense_category_account_map entry"
 * TRANSP had 17 expense-side map rows and TRK 10; USMCA had ZERO. So EVERY USMCA bill failed. It was
 * NOT a missing Finalize/Post feature — bills.service.ts already posts on create and the flag is on.
 *
 * THE SIBLING DEFECT (ROW 259): driver-subaccount-provision.service.ts inserted account_number NULL
 * with the comment "assigned when the account syncs to QBO". USMCA has no QuickBooks connection, so
 * those accounts could never be numbered and every hire minted another NULL. Third instance of the
 * "assumes a QBO mirror exists" class, after the WO vendor lookup (#4048) and the spend-by-vendor join.
 *
 * WHAT IT ENFORCES (static):
 *   A. the seed migration maps every category_kind TRANSP maps, so a new entity is not half-seeded;
 *   B. the sub-account creator derives account_number locally and does NOT insert it as NULL.
 *
 * The DATA assertion (every active entity has >= 1 expense map row) needs a DB and belongs to GUARD's
 * live pass — stated here rather than faked with a green static check.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:entity-expense-category-map-complete";
const MIGRATION = "db/migrations/202611190000_usmca_expense_category_map_and_driver_subaccount_numbering.sql";
const PROVISIONER = "apps/backend/src/accounting/driver-subaccount-provision.service.ts";

/** The kinds TRANSP maps on prod — a new entity missing any of these will fail-loud at post time. */
export const REQUIRED_KINDS = [
  "maintenance", "fuel", "toll", "lumper", "driver_pay",
  "cash_advance", "escrow", "insurance", "factoring_fee", "office", "other",
];

function stripComments(src) {
  return String(src).replace(/--[^\n]*/g, "");
}

export function analyse(files) {
  const problems = [];
  const mig = files[MIGRATION];
  const prov = files[PROVISIONER];

  if (mig == null) {
    problems.push(`${MIGRATION} is missing — without it USMCA bills fail to post with BILL_LINE_ACCOUNT_UNRESOLVED.`);
  } else {
    const body = stripComments(mig);
    for (const kind of REQUIRED_KINDS) {
      if (!new RegExp(`'${kind}'`).test(body)) {
        problems.push(
          `${MIGRATION}: category_kind '${kind}' is not mapped. TRANSP maps it, so a bill using it ` +
            `will FAIL LOUD at post time with no silent fallback — a half-seeded entity is worse than ` +
            `an unseeded one because the failure only appears on the categories nobody tested.`
        );
      }
    }
  }

  if (prov == null) {
    problems.push(`${PROVISIONER} is missing.`);
  } else {
    const body = stripComments(prov);
    // The INSERT must not hardcode a NULL account_number.
    if (/INSERT INTO catalogs\.accounts[\s\S]{0,900}?VALUES\s*\(\s*NULL\s*,/.test(body)) {
      problems.push(
        `${PROVISIONER}: still inserts account_number as NULL. That assumed QuickBooks would assign it, ` +
          `which is false for any entity without a QBO connection (USMCA) — the account can then NEVER ` +
          `be numbered and every new hire mints another NULL, breaking reconciliation and sorting.`
      );
    }
    if (!/lpad\s*\(/.test(body) || !/account_subtype/.test(body)) {
      problems.push(
        `${PROVISIONER}: no local number derivation (lpad) and/or no account_subtype inheritance. ` +
          `Both must be derived locally — under parallel books TMS is authoritative for its own chart.`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [MIGRATION, PROVISIONER]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodMig = REQUIRED_KINDS.map((k) => `('${k}','x','1')`).join(",");
  const goodProv = "INSERT INTO catalogs.accounts (...) SELECT p.account_number || lpad(x,3,'0'), p.account_subtype FROM catalogs.accounts p";
  const bugProv = "INSERT INTO catalogs.accounts (a,b) VALUES ( NULL, $1, 'Asset', NULL, $2::uuid )";

  t("complete map + local numbering passes", analyse({ [MIGRATION]: goodMig, [PROVISIONER]: goodProv }).length === 0);
  t("a missing category_kind FAILS",
    analyse({ [MIGRATION]: goodMig.replace("('maintenance','x','1'),", ""), [PROVISIONER]: goodProv }).length === 1);
  // The REAL pre-fix provisioner.
  t("NULL account_number insert FAILS",
    analyse({ [MIGRATION]: goodMig, [PROVISIONER]: bugProv }).length >= 1);
  t("a comment mentioning the old NULL does not trip it",
    analyse({ [MIGRATION]: goodMig, [PROVISIONER]: `-- used to be VALUES ( NULL,\n${goodProv}` }).length === 0);
  t("missing migration FAILS", analyse({ [MIGRATION]: null, [PROVISIONER]: goodProv }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 5 cases (2 pass-shapes incl. comment-immunity, 3 fail-shapes)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — expense category map complete; sub-account numbering is QBO-independent`);
