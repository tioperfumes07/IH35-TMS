#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  migration: "db/migrations/0300_create_fuel_transactions.sql",
  route: "apps/backend/src/fuel/fuel-transactions.routes.ts",
  api: "apps/frontend/src/api/fuelPlanner.ts",
  table: "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx",
  reverse: "apps/frontend/src/components/fuel/FuelTransactionsReverseSection.tsx",
};

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
}

function failures(source) {
  const checks = [
    ["canonical gallons column remains nullable", /gallons numeric\(10, 3\) NULL/.test(source.migration)],
    ["API preserves null gallons", source.route.includes("gallons: row.gallons === null ? null : Number(row.gallons)")],
    [
      "frontend contract admits null gallons",
      /export type FuelTransactionListItem = \{[\s\S]*?gallons: number \| null;[\s\S]*?amount_cents: number;/.test(source.api),
    ],
    ["history table shows unknown gallons honestly", source.table.includes('row.gallons == null ? "—" : row.gallons.toFixed(2)')],
    ["CSV exports unknown gallons as blank", source.table.includes('row.gallons == null ? "" : row.gallons.toFixed(2)')],
    ["reverse panels show unavailable gallons", source.reverse.includes('row.gallons == null ? "Gallons unavailable"')],
    ["old API zero coercion is absent", !source.route.includes("row.gallons === null ? 0")],
    ["old CSV zero coercion is absent", !source.table.includes("row.gallons || 0")],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const source = readSources();
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["api-zero", { ...source, route: source.route.replace("row.gallons === null ? null", "row.gallons === null ? 0") }],
    [
      "type-required",
      {
        ...source,
        api: source.api.replace(
          /(export type FuelTransactionListItem = \{[\s\S]*?)gallons: number \| null;/,
          "$1gallons: number;"
        ),
      },
    ],
    ["table-zero", { ...source, table: source.table.replace('row.gallons == null ? "—"', 'row.gallons == null ? "0.00"') }],
    ["csv-zero", { ...source, table: source.table.replace('row.gallons == null ? ""', 'row.gallons == null ? "0.00"') }],
    ["reverse-zero", { ...source, reverse: source.reverse.replace('row.gallons == null ? "Gallons unavailable"', 'row.gallons == null ? "0 gal"') }],
  ];
  const missed = mutations.filter(([, mutated]) => failures(mutated).length === 0).map(([name]) => name);
  if (missed.length) {
    console.error(`verify-fuel-transaction-null-gallons-honesty --selftest FAILED: ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-fuel-transaction-null-gallons-honesty --selftest PASS ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-fuel-transaction-null-gallons-honesty FAILED:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-fuel-transaction-null-gallons-honesty PASS — nullable canonical gallons stay unknown across API, history, CSV, and reverse panels");
