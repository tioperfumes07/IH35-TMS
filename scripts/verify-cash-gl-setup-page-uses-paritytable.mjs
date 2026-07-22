#!/usr/bin/env node
/**
 * verify-cash-gl-setup-page-uses-paritytable — banking Cash-GL setup surface.
 *
 * The bank-account → cash-GL-account mapping page must use the shared ParityTable
 * grammar, not a hand-rolled <table>. Display-only migration: column order
 * (Bank Account, Cash GL Account), the inline ReferenceSelect (+ Create) mapping editor
 * (Owner/Administrator gated, handler unchanged), the ListErrorBanner error
 * surface, and the empty text must all be preserved. This page is setup-only
 * config (banking.bank_accounts.ledger_account_id) — it posts NO journal
 * entries, and this guard pins that the "No journal entries are posted here"
 * disclosure stays.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-gl-setup-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/CashGlSetupPage.tsx";

const REQUIRED_LABELS = ["Bank Account", "Cash GL Account"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
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
  if (!src.includes('storageKey="banking-cash-gl-setup"')) {
    errors.push(`${PAGE}: must set storageKey="banking-cash-gl-setup"`);
  }
  if (!src.includes('tableTestId="cash-gl-setup-table"')) {
    errors.push(`${PAGE}: must set tableTestId="cash-gl-setup-table"`);
  }
  if (!src.includes("ReferenceSelect") || !/createKind=["']account["']/.test(src)) {
    errors.push(`${PAGE}: must keep the inline ReferenceSelect cash-GL mapping editor (createKind=account)`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep the ListErrorBanner error surface on query error`);
  }
  if (!src.includes("No bank accounts for this company.")) {
    errors.push(`${PAGE}: must keep the empty text "No bank accounts for this company."`);
  }
  if (!src.includes("journal entries are posted here")) {
    errors.push(`${PAGE}: must keep the "No journal entries are posted here" setup-only disclosure`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
    const columns = [
      { key: "account_name", label: "Bank Account" },
      { key: "ledger_account_id", label: "Cash GL Account", render: (bank) => <ReferenceSelect createKind="account" /> },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="banking-cash-gl-setup"
      tableTestId="cash-gl-setup-table"
      emptyText="No bank accounts for this company."
    />
    <p>No journal entries are posted here.</p>
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    export function CashGlSetupPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Bank Account</th></tr></thead>
        </table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/editor/error surface preserved; setup-only.`);
}

main();
