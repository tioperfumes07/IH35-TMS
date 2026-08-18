#!/usr/bin/env node
/**
 * verify-accounts-payable-aging-page-uses-paritytable — qbo-parity-a1 (AccountsPayableAgingPage surface)
 *
 * Accounting-module A/P aging report (/accounting/accounts-payable, read-only — TMS bills are the
 * canonical A/P subledger). Owner-greenlit DISPLAY-ONLY migration: BOTH the By Vendor grid AND the
 * By Vendor Type grid must use the shared ParityTable grammar (sort / resize / gear / pager) with
 * the same 8 columns in the same order (Vendor / Vendor type / Current / 1-30 / 31-60 / 61-90 /
 * 91+ / Total), the vendor + "Open bills" deep-links, the 61-90 / 91+ red flags, URL-persisted
 * sort via useUrlSort feeding ParityTable's controlled-sort props, and the TOTAL row values
 * preserved 1:1 as a strip under each grid.
 *
 * ACCT-F3568 (already shipped, confirmed live in this file) went further than this guard's
 * original spec assumed: the By Vendor Type grouped rollup was ALSO migrated onto ParityTable
 * (same VENDOR_COLUMNS grammar + typeFilter, storageKey="acct-ap-aging-by-type"), so there is no
 * longer any hand-rolled "GroupBlock" table anywhere in this file — ZERO hand-rolled JSX <table>s
 * are expected now. The only remaining <table> markup at all is printList()'s printLetterHtml()
 * call, a raw HTML STRING built for a separate print window (not JSX, not part of the React tree,
 * a ParityTable cannot render there) — that one is legitimate and exempt from the hand-rolled-table
 * check below. Query errors surface ListErrorState (never a bare red banner); the honest
 * mirror-provenance empty states stay. This is a report surface — it must never post or mutate
 * (no useMutation), and the QBO-mirror provenance strip (verify-ap-aging-qbo-tie) stays intact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounts-payable-aging-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";

const REQUIRED_LABELS = ["Vendor", "Vendor type", "Current", "1-30", "31-60", "61-90", "91+", "Total"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (By Vendor grid + By Vendor Type grid, ACCT-F3568)`);
  }
  // printList()'s printLetterHtml({ bodyHtml: `...` }) call builds a raw HTML STRING for a
  // separate print window, not JSX — <table>/<thead> there are legitimate print-document markup,
  // not a hand-rolled React table. Strip that one template literal before scanning for hand-rolled
  // markup, so the check still fires on a REAL accidental JSX <table> anywhere else in the file.
  const srcNoBodyHtml = src.replace(/bodyHtml:\s*`[\s\S]*?`,/, "bodyHtml: ``,");
  const handRolledTables = (srcNoBodyHtml.match(/<table[\s>]/g) ?? []).length;
  if (handRolledTables > 0) {
    errors.push(
      `${PAGE}: expected 0 hand-rolled JSX <table> — By Vendor Type was migrated to ParityTable too ` +
        `(ACCT-F3568, same as By Vendor), found ${handRolledTables}`,
    );
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing ParityTable column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="acct-ap-aging-by-vendor"')) {
    errors.push(`${PAGE}: must set storageKey="acct-ap-aging-by-vendor"`);
  }
  if (!src.includes('tableTestId="ap-aging-by-vendor-table"')) {
    errors.push(`${PAGE}: must set tableTestId="ap-aging-by-vendor-table"`);
  }
  if (!/sortKey=\{sortKey\}/.test(src) || !/sortDirection=\{sortDirection\}/.test(src) || !/onSortChange=\{onSortChange\}/.test(src)) {
    errors.push(`${PAGE}: must wire useUrlSort onto <ParityTable> via sortKey/sortDirection/onSortChange (BANK-SORT-ROLLOUT-ACCT-AP2)`);
  }
  if (!src.includes('data-testid="ap-aging-by-vendor-total"') || !src.includes("TOTAL")) {
    errors.push(`${PAGE}: must keep the By Vendor TOTAL row (bucket totals preserved 1:1)`);
  }
  if (!src.includes("text-red-600")) {
    errors.push(`${PAGE}: must keep the 61-90 / 91+ red bucket flags (QBO-grade spec)`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("No open A/P in TMS bills.")) {
    errors.push(`${PAGE}: must keep the honest mirror-provenance empty states ("No open A/P in TMS bills.")`);
  }
  if (!src.includes("Open bills")) {
    errors.push(`${PAGE}: must keep the per-vendor "Open bills" deep-link into /accounting/bills`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only report — must not add mutations (TMS bills are the canonical A/P subledger)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const VENDOR_COLUMNS = [
      { key: "vendor", label: "Vendor" },
      { key: "type", label: "Vendor type" },
      { key: "current", label: "Current" },
      { key: "d1_30", label: "1-30" },
      { key: "d31_60", label: "31-60" },
      { key: "d61_90", label: "61-90", cellClass: "text-right text-red-600" },
      { key: "d90_plus", label: "91+" },
      { key: "total", label: "Total" },
    ];
    const emptyMessage = "No open A/P in TMS bills.";
    <Link>Open bills</Link>
    <ListErrorState title="Couldn't load A/P aging" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="acct-ap-aging-by-vendor"
      tableTestId="ap-aging-by-vendor-table"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortChange={onSortChange}
    />
    <div data-testid="ap-aging-by-vendor-total"><span>TOTAL</span></div>
    <ParityTable
      storageKey="acct-ap-aging-by-type"
      tableTestId="ap-aging-by-type-table"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortChange={onSortChange}
    />
  `;
  // The real page's printList() builds a raw print-window HTML string via printLetterHtml — a
  // legitimate <table>/<thead> there must NOT be flagged as a hand-rolled JSX table.
  const goodWithPrintTemplate =
    good +
    `
    const printList = () => {
      printLetterHtml({
        title: "A/P aging",
        bodyHtml: \`
          <table>
            <thead><tr><th>Vendor</th></tr></thead>
            <tbody></tbody>
          </table>
        \`,
      });
    };
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function AccountsPayableAgingPage() {
      return (
        <div>
          <table className="w-full"><thead><tr><th>Vendor</th></tr></thead></table>
          <table className="w-full"><tbody><GroupBlock /></tbody></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const goodWithPrintErrors = assertMigrated(goodWithPrintTemplate);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (goodWithPrintErrors.length) {
    console.error(`${LABEL} --selftest FAIL good-with-print-template fixture (print HTML string false-flagged):`, goodWithPrintErrors);
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
  console.log(
    `OK ${LABEL}: ${PAGE} both By Vendor and By Vendor Type grids use ParityTable; columns/TOTAL/red flags/URL sort preserved; read-only.`,
  );
}

main();
