#!/usr/bin/env node
// CUSTOMER-DETAIL-BADGE-IGNORES-DEACTIVATED-AT — guard
//
// Live-reproduced on customer CASCADE-VOID-TEST-20260826 immediately after MDATA-DEACTIVATE-RLS-500
// (#16433) was fixed and deployed: clicking "Inactivate" correctly flipped the button to "Reactivate"
// and Neon confirmed deactivated_at was set — but the top status badge on CustomerDetail.tsx (and the
// mirrored "Status" DetailRow on Customers.tsx's master-detail summary panel) still read "Active",
// because both read the raw mdata.customers.status enum column, which the Inactivate/Reactivate action
// never touches. The codebase's own established convention (list-filter `status=active|inactive`
// queries, this same page's contacts/lanes sub-tables) already treats `deactivated_at` as the canonical
// lifecycle signal — this guard fails if either badge/row stops deriving from it.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DETAIL_FILE = "apps/frontend/src/pages/CustomerDetail.tsx";
const LIST_FILE = "apps/frontend/src/pages/Customers.tsx";

export function check(detailText, listText) {
  const failures = [];

  if (!/statusVariant\(customer\.deactivated_at != null \? "inactive" : customer\.status\)/.test(detailText)) {
    failures.push(`${DETAIL_FILE} top status badge no longer derives its variant from deactivated_at first`);
  }
  if (!/statusLabel\(customer\.deactivated_at != null \? "inactive" : customer\.status\)/.test(detailText)) {
    failures.push(`${DETAIL_FILE} top status badge no longer derives its label from deactivated_at first`);
  }

  if (!/customerStatusLabel\(customer\.deactivated_at != null \? "inactive" : customer\.status\)/.test(listText)) {
    failures.push(`${LIST_FILE} master-detail "Status" row no longer derives from deactivated_at first`);
  }

  return failures;
}

function run() {
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");
  const failures = check(detailText, listText);
  if (failures.length > 0) {
    console.error("FAIL: customer-status-badge-honors-deactivated-at");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Customer status badge/row on both CustomerDetail.tsx and Customers.tsx honor deactivated_at ahead of the separate status enum column");
}

function selftest() {
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");

  const offenderDetail = detailText.replace(
    /<StatusBadge variant=\{statusVariant\(customer\.deactivated_at != null \? "inactive" : customer\.status\)\}>\s*\{statusLabel\(customer\.deactivated_at != null \? "inactive" : customer\.status\)\}\s*<\/StatusBadge>/,
    `<StatusBadge variant={statusVariant(customer.status)}>{statusLabel(customer.status)}</StatusBadge>`,
  );
  if (offenderDetail === detailText) {
    console.error("FAIL(selftest): offender mutation did not change CustomerDetail.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderDetail, listText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (detail badge reverted to raw status) was NOT caught");
    process.exit(1);
  }

  const offenderList = listText.replace(
    'customerStatusLabel(customer.deactivated_at != null ? "inactive" : customer.status)',
    "customerStatusLabel(customer.status)",
  );
  if (offenderList === listText) {
    console.error("FAIL(selftest): offender mutation did not change Customers.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(detailText, offenderList);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (list DetailRow reverted to raw status) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
