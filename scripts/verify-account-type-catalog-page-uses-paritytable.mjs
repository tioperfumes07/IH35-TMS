#!/usr/bin/env node
/**
 * verify-account-type-catalog-page-uses-paritytable — qbo-parity (Account Type Catalog surface)
 *
 * The Accounting → Account Type Catalog grid (read-only COA taxonomy) must use the shared
 * ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Query failures must
 * surface ListErrorState + Retry (never a silent empty table). Columns Account Type /
 * Detail Types / Statement / Normal Balance preserved in order; per-group sections
 * (groupName headers), the statement badge chrome, and the settled empty copy preserved.
 * Display-only migration — this page is read-only (no mutations may appear).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-type-catalog-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx";

const REQUIRED_LABELS = ["Account Type", "Detail Types", "Statement", "Normal Balance"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on account-type-catalog query failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="account-type-catalog"')) {
    errors.push(`${PAGE}: must set storageKey="account-type-catalog"`);
  }
  if (!src.includes('tableTestId="account-type-catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="account-type-catalog-table"`);
  }
  if (!src.includes("Couldn't load account type catalog")) {
    errors.push(`${PAGE}: must keep ListErrorState title for account-type-catalog outage`);
  }
  if (!src.includes("No account types found.")) {
    errors.push(`${PAGE}: must keep the settled empty copy for empty account types`);
  }
  if (!src.includes("groupName")) {
    errors.push(`${PAGE}: must keep per-group section rendering (groupName headers)`);
  }
  if (!src.includes("STATEMENT_COLOR")) {
    errors.push(`${PAGE}: must keep the statement badge color chrome`);
  }
  if (/useMutation/.test(src)) {
    errors.push(`${PAGE}: read-only catalog surface must not gain mutations (display-only lock)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const STATEMENT_COLOR = {};
    const COLUMNS = [
      { key: "accountType", label: "Account Type" },
      { key: "detailTypes", label: "Detail Types" },
      { key: "statement", label: "Statement" },
      { key: "normalBalance", label: "Normal Balance" },
    ];
    <ListErrorState title="Couldn't load account type catalog" status={0} onRetry={() => {}} />
    {groups.map(([groupName, entries]) => (
      <ParityTable
        storageKey="account-type-catalog"
        tableTestId="account-type-catalog-table"
        emptyText="No account types found."
      />
    ))}
    <p>No account types found.</p>
  `;
  const bad = `
    export function AccountTypeCatalogPage() {
      return (
        <div>
          <table><thead><tr><th>Account Type</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + group sections preserved.`);
}

main();
