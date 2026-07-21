#!/usr/bin/env node
/**
 * verify-banking-tx-register-uses-paritytable — BankingTx Phase B shell swap guard.
 *
 * Pins the main register of BankingTransactionsDesignView onto the shared ParityTable
 * with A1–A5 capabilities wired, WITHOUT weakening the CI-guarded sort→group→page
 * pipeline (bankTxnSortGroup). Safety properties:
 *   1. Imports + renders exactly one <ParityTable> (no hand-rolled <table>/<thead>/<tbody>
 *      and no TableHeaderCell/useTablePref — those are the pre-Phase-B shell).
 *   2. A4 external sort: sortMode="external" + controlled sortKey/sortDirection/onSortChange.
 *   3. A3 pre-paged + external chrome: hidePager + page/onPageChange + pageSize from the
 *      current page's rows (pipeline pages; ParityTable must not double-slice).
 *   4. A2 group bands: groupBy when month/money mode is active.
 *   5. A1 controlled expansion: expandedKeys/onExpandedChange + expandMode="single" +
 *      renderExpanded (categorize/match panel preserved).
 *   6. A5 controlled selection: selectedKeys/onSelectionChange + maxSelectable={200} with
 *      onSelectionCapExceeded; useBulkSelection + BulkActionBar still present (external bar).
 *   7. Column resize: enableColumnResize + storageKey="banking-transactions".
 *   8. Pipeline intact: buildPagedBankTxnGroups(tableRows, …) still groups the FULL sorted set.
 *
 * Usage:
 *   node scripts/verify-banking-tx-register-uses-paritytable.mjs
 *   node scripts/verify-banking-tx-register-uses-paritytable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-tx-register-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertMigrated(src) {
  const errors = [];
  const body = stripComments(src);

  if (!body.includes('from "../../../components/parity/ParityTable"') && !body.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((body.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${PAGE}: expected exactly one <ParityTable>`);
  }
  for (const forbidden of [/<table[\s>]/, /<thead[\s>]/, /<tbody[\s>]/]) {
    if (forbidden.test(body)) {
      errors.push(`${PAGE}: contains forbidden hand-rolled table markup (${forbidden})`);
    }
  }
  if (/TableHeaderCell/.test(body) || /useTablePref/.test(body)) {
    errors.push(`${PAGE}: must not keep TableHeaderCell/useTablePref after ParityTable shell swap`);
  }

  // A4 external sort
  if (!/sortMode="external"/.test(body)) {
    errors.push(`${PAGE}: must set sortMode="external" (pipeline owns row order)`);
  }
  if (!/sortKey=\{sortBy\.key\}/.test(body) || !/sortDirection=\{sortBy\.dir\}/.test(body)) {
    errors.push(`${PAGE}: must paint controlled sort indicators from sortBy`);
  }
  if (!/onSortChange=\{/.test(body)) {
    errors.push(`${PAGE}: must wire onSortChange (controlled sort required for external mode)`);
  }

  // A3 pre-paged + external chrome
  if (!/\bhidePager\b/.test(body)) {
    errors.push(`${PAGE}: must set hidePager (toolbar pager owns chrome)`);
  }
  if (!/page=\{safeCurrentPage\}/.test(body) && !/page=\{currentPage\}/.test(body)) {
    errors.push(`${PAGE}: must pass controlled page`);
  }
  if (!/onPageChange=\{setCurrentPage\}/.test(body)) {
    errors.push(`${PAGE}: must wire onPageChange={setCurrentPage}`);
  }
  if (!/pageSize=\{pagedRows\.length/.test(body)) {
    errors.push(`${PAGE}: must set pageSize from pre-paged rows length (no double slice)`);
  }

  // A2 group bands
  if (!/groupBy=\{/.test(body)) {
    errors.push(`${PAGE}: must wire groupBy for month/money bands`);
  }

  // A1 controlled expansion
  if (!/expandedKeys=\{/.test(body) || !/onExpandedChange=\{/.test(body)) {
    errors.push(`${PAGE}: must wire A1 controlled expansion (expandedKeys/onExpandedChange)`);
  }
  if (!/expandMode="single"/.test(body)) {
    errors.push(`${PAGE}: must set expandMode="single" (one categorize panel at a time)`);
  }
  if (!/renderExpanded=\{/.test(body)) {
    errors.push(`${PAGE}: must pass renderExpanded (categorize/match inline panel)`);
  }

  // A5 controlled selection + existing bulk bar
  if (!/selectedKeys=\{/.test(body) || !/onSelectionChange=\{/.test(body)) {
    errors.push(`${PAGE}: must wire A5 controlled selection`);
  }
  if (!/maxSelectable=\{200\}/.test(body)) {
    errors.push(`${PAGE}: must pass maxSelectable={200}`);
  }
  if (!/onSelectionCapExceeded=\{/.test(body)) {
    errors.push(`${PAGE}: must pass onSelectionCapExceeded (cap toast)`);
  }
  if (!/useBulkSelection/.test(body) || !/BulkActionBar/.test(body)) {
    errors.push(`${PAGE}: must keep useBulkSelection + external BulkActionBar`);
  }

  // Resize + storage
  if (!/enableColumnResize/.test(body)) {
    errors.push(`${PAGE}: must enable column resize (enableColumnResize)`);
  }
  if (!/storageKey="banking-transactions"/.test(body)) {
    errors.push(`${PAGE}: must persist widths under storageKey="banking-transactions"`);
  }

  // Pipeline intact
  if (!/buildPagedBankTxnGroups\s*\(\s*tableRows/.test(body)) {
    errors.push(`${PAGE}: must keep buildPagedBankTxnGroups(tableRows, …) (sort→group→page pipeline)`);
  }
  if (!/from ["']\.\/bankTxnSortGroup["']/.test(body)) {
    errors.push(`${PAGE}: must import bankTxnSortGroup helper`);
  }

  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
    import { useBulkSelection } from "../../../hooks/useBulkSelection";
    import { buildPagedBankTxnGroups } from "./bankTxnSortGroup";
    const paged = buildPagedBankTxnGroups(tableRows, mode, sortBy, page, size);
    <BulkActionBar />
    <ParityTable
      columns={parityColumns}
      rows={pagedRows}
      sortKey={sortBy.key}
      sortDirection={sortBy.dir}
      onSortChange={(k, d) => {}}
      sortMode="external"
      page={safeCurrentPage}
      onPageChange={setCurrentPage}
      pageSize={pagedRows.length || viewSettings.pageSize}
      hidePager
      enableColumnResize
      storageKey="banking-transactions"
      selectable
      maxSelectable={200}
      onSelectionCapExceeded={() => {}}
      selectedKeys={paritySelectedKeys}
      onSelectionChange={(keys) => {}}
      expandedKeys={expandedTxId ? [expandedTxId] : []}
      onExpandedChange={(keys) => {}}
      expandMode="single"
      renderExpanded={renderExpandedRegisterRow}
      groupBy={showGroupHeaders ? { getKey: () => "x", renderHeader: () => null } : undefined}
    />
  `;
  const bad = `
    import { TableHeaderCell, useTablePref } from "../../../components/table";
    export function BankingTransactionsDesignView() {
      return <table><thead /><tbody /></table>;
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 8) {
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
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: BankingTransactionsDesignView register uses ParityTable with A1–A5 wired; bankTxnSortGroup pipeline preserved.`
  );
}

main();
