#!/usr/bin/env node
/**
 * verify-runner-table-uses-paritytable — qbo-parity-a1 (report runner surface)
 *
 * The shared report runner must use ParityTable while preserving dynamic columns,
 * alignment, formatting, sorting callbacks, stable row keys, and empty-state copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-runner-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/runners/RunnerTable.tsx";

function assertMigrated(src) {
  const errors = [];
  const required = [
    ['from "../../../components/parity/ParityTable"', "must import the shared ParityTable"],
    ["type ParityColumn", "must type the dynamic ParityTable columns"],
    ["columns.map((column)", "must preserve every configured runner column"],
    ["key: column.key", "must preserve configured column keys"],
    ["label: column.label", "must preserve configured column labels"],
    ["sortable: Boolean(column.sortable)", "must preserve configured sortable behavior"],
    ["column.align === \"right\"", "must preserve right alignment"],
    ["column.align === \"center\"", "must preserve center alignment"],
    ["formatCell(row.record[column.key], column.format)", "must preserve runner cell formatting"],
    ["sortValue(row.record[column.key], column.format)", "must preserve typed sort values"],
    ["rowKey: String(record.id ?? index)", "must preserve id/index row-key fallback"],
    ["storageKey={tableId}", "must preserve per-report table preferences"],
    ['emptyText="No results for these filters"', "must preserve empty-state copy"],
    ["onSort?.(key)", "must preserve the optional sort callback"],
  ];

  for (const [needle, message] of required) {
    if (!src.includes(needle)) errors.push(`${PAGE}: ${message}`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${PAGE}: expected exactly one <ParityTable>`);
  }
  for (const forbidden of [/<table[\s>]/, /<thead[\s>]/, /<tbody[\s>]/, /TableHeaderCell/, /useTablePref/]) {
    if (forbidden.test(src)) {
      errors.push(`${PAGE}: contains forbidden hand-rolled table implementation (${forbidden})`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const parityRows = rows.map((record, index) => ({ record, rowKey: String(record.id ?? index) }));
    const parityColumns = columns.map((column) => ({
      key: column.key,
      label: column.label,
      sortable: Boolean(column.sortable),
      className: column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
      render: (row) => formatCell(row.record[column.key], column.format),
      sortValue: (row) => sortValue(row.record[column.key], column.format),
    })) satisfies ParityColumn<unknown>[];
    <ParityTable
      columns={parityColumns}
      rows={parityRows}
      rowKey={(row) => row.rowKey}
      storageKey={tableId}
      emptyText="No results for these filters"
      onSortChange={(key) => onSort?.(key)}
    />;
  `;
  const bad = `
    import { TableHeaderCell, useTablePref } from "../../../components/table";
    export function RunnerTable() {
      return <table><thead><tbody /></thead></table>;
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable with runner behavior preserved.`);
}

main();
