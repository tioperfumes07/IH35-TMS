#!/usr/bin/env node
/**
 * Rule-17 guard: prepaid expenses forward EntityLinks + JE reverse mapping (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-prepaid-expenses-entitylink-reverse";
const PREPAID_PAGE = "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertPrepaidExpensesEntitylinkReverse() {
  const errors = [];
  const prepaid = read(PREPAID_PAGE);
  const jeDetail = read(JE_DETAIL);
  const entityLink = read(ENTITY_LINK);

  if (!prepaid.includes("useSearchParams")) {
    errors.push(`${PREPAID_PAGE}: must honor ?asset_id= reverse drill param`);
  }
  if (!/purchase_je_id/.test(prepaid) || !/kind=["']journal_entry["']/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: detail must EntityLink purchase_je_id → journal_entry`);
  }
  if (!/asset_account_id/.test(prepaid) || !/kind=["']account["']/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: detail must EntityLink GL accounts (asset/expense/payment)`);
  }
  if (!/case ["']prepaid_asset["']:/.test(jeDetail) || !/case ["']prepaid_amortization["']:/.test(jeDetail)) {
    errors.push(`${JE_DETAIL}: postingEntityKind must map prepaid_asset + prepaid_amortization`);
  }
  if (!entityLink.includes("prepaid_asset") || !/\/accounting\/prepaid-expenses\?asset_id=/.test(entityLink)) {
    errors.push(`${ENTITY_LINK}: must resolve prepaid_asset → /accounting/prepaid-expenses?asset_id=`);
  }
  return errors;
}

function selftest() {
  const errors = assertPrepaidExpensesEntitylinkReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPrepaidExpensesEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
