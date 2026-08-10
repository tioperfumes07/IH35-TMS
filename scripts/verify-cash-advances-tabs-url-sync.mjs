#!/usr/bin/env node
/**
 * verify-cash-advances-tabs-url-sync.mjs — Ops F: Cash Advances tabs use ?tab=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advances-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";

function failures(source) {
  const errors = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseCashAdvancesTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<(typeof SUBNAV)[number][1]>("all")')) {
    errors.push("local tab useState still present");
  }
  for (const needle of [
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = failures(source);
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")} in ${PAGE}`);
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const good = `useSearchParams searchParams.get("tab") parseCashAdvancesTab params.set("tab", next)
    title="Couldn't load cash advance totals" onRetry={() => void kpisQuery.refetch()}
    title="Couldn't load cash advances" onRetry={() => void listQuery.refetch()} listQuery.isError ? (
    title="Couldn't load cash advance details" onRetry={() => void detailQuery.refetch()}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed: ${failures(good).join("; ")}`);
  const mutations = [
    "useSearchParams",
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} mutations caught)`);
} else run();
