#!/usr/bin/env node
/**
 * verify-bank-register-sort-group.mjs — Audit gap #5 residual (04-BANKING.md)
 *
 * Locks Bank Transactions DesignView sort/group QBO parity so it cannot regress:
 *   1. Pipeline is sort FULL set → group → page (never page-then-group on pagedRows).
 *   2. Month bands follow date ASC (oldest month first), not always newest-first.
 *   3. Money in/out grouping mode + flat (All dates / turnOffGrouping) exist.
 *   4. Non-date sorts with month mode auto-flatten (group-off when sorting).
 *
 * Pure-logic selftest mirrors apps/frontend/.../bankTxnSortGroup.ts.
 *
 * Usage:
 *   node scripts/verify-bank-register-sort-group.mjs
 *   node scripts/verify-bank-register-sort-group.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const HELPER = "apps/frontend/src/pages/banking/components/bankTxnSortGroup.ts";
const VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ─── Pure pipeline (mirrors bankTxnSortGroup.ts) ───────────────────────────

function isMoneyInTxn(tx) {
  const cents = Number(tx.amount_cents ?? 0);
  return Boolean(tx.is_credit) || cents < 0;
}

function monthKeyFromDate(rawDate) {
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resolveBankTxnGroupMode(mode, sort) {
  if (mode === "month" && sort.key !== "date") return "none";
  return mode;
}

export function groupBankTransactions(sortedRows, mode, sort) {
  const effective = resolveBankTxnGroupMode(mode, sort);
  if (effective === "none") {
    return [{ key: "all", title: "All transactions", rows: sortedRows }];
  }
  if (effective === "money") {
    const moneyIn = [];
    const moneyOut = [];
    for (const tx of sortedRows) {
      if (isMoneyInTxn(tx)) moneyIn.push(tx);
      else moneyOut.push(tx);
    }
    const bands = [];
    if (moneyIn.length) bands.push({ key: "money_in", title: "Money in", rows: moneyIn });
    if (moneyOut.length) bands.push({ key: "money_out", title: "Money out", rows: moneyOut });
    return bands;
  }
  const bucket = new Map();
  for (const tx of sortedRows) {
    const key = monthKeyFromDate(tx.transaction_date);
    const arr = bucket.get(key) ?? [];
    arr.push(tx);
    bucket.set(key, arr);
  }
  const monthDir = sort.key === "date" && sort.dir === "asc" ? 1 : -1;
  return [...bucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0) * monthDir)
    .map(([key, rows]) => ({ key, title: key, rows }));
}

export function pageBankTxnGroups(groups, page, pageSize) {
  const flat = [];
  for (const g of groups) {
    for (const row of g.rows) flat.push({ key: g.key, title: g.title, row });
  }
  const totalRows = flat.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const slice = flat.slice(pageStartIndex, pageStartIndex + pageSize);
  const out = [];
  for (const item of slice) {
    const last = out[out.length - 1];
    if (last && last.key === item.key) last.rows.push(item.row);
    else out.push({ key: item.key, title: item.title, rows: [item.row] });
  }
  return { groups: out, totalRows, pageStartIndex };
}

export function buildPagedBankTxnGroups(sortedRows, mode, sort, page, pageSize) {
  const effectiveMode = resolveBankTxnGroupMode(mode, sort);
  const groups = groupBankTransactions(sortedRows, mode, sort);
  return { ...pageBankTxnGroups(groups, page, pageSize), effectiveMode };
}

/** Bug-era pipeline: page first, then always newest-month-first — must FAIL selftests. */
export function buggyPageThenGroupNewestFirst(sortedRows, page, pageSize) {
  const start = (page - 1) * pageSize;
  const paged = sortedRows.slice(start, start + pageSize);
  const bucket = new Map();
  for (const tx of paged) {
    const key = monthKeyFromDate(tx.transaction_date);
    const arr = bucket.get(key) ?? [];
    arr.push(tx);
    bucket.set(key, arr);
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, rows]) => ({ key, rows }));
}

// ─── Static wiring checks ──────────────────────────────────────────────────

export function checksFor(helperSrc, viewSrc) {
  const h = stripComments(helperSrc);
  const v = stripComments(viewSrc);
  return {
    helperExportsPipeline:
      /export function buildPagedBankTxnGroups/.test(h) &&
      /export function groupBankTransactions/.test(h) &&
      /export function resolveBankTxnGroupMode/.test(h) &&
      /monthDir/.test(h) &&
      /sort\.key === "date" && sort\.dir === "asc"/.test(h),
    helperMoneyBands: /Money in/.test(h) && /Money out/.test(h) && /money_in/.test(h),
    helperAutoFlatten: /mode === "month" && sort\.key !== "date"/.test(h),
    viewImportsHelper: /from ["']\.\/bankTxnSortGroup["']/.test(v) && /buildPagedBankTxnGroups/.test(v),
    viewGroupsFullSet:
      /buildPagedBankTxnGroups\s*\(\s*tableRows/.test(v) &&
      !/for \(const tx of pagedRows\)/.test(v),
    viewMoneyToggle: />\s*Money in\/out\s*</.test(v) && /groupMode:\s*"money"/.test(v),
    viewFlatToggle: />\s*All dates\s*</.test(v) && /turnOffGrouping:\s*true/.test(v),
  };
}

const CHECK_LABELS = {
  helperExportsPipeline: "helper exports sort→group→page + monthDir follows date ASC",
  helperMoneyBands: "helper emits Money in / Money out bands",
  helperAutoFlatten: "helper auto-flattens month mode on non-date sort",
  viewImportsHelper: "DesignView imports buildPagedBankTxnGroups from bankTxnSortGroup",
  viewGroupsFullSet: "DesignView groups tableRows (full sorted set), not pagedRows",
  viewMoneyToggle: "DesignView exposes Money in/out grouping control",
  viewFlatToggle: "DesignView exposes All dates / turnOffGrouping flat list",
};

export function run() {
  const helperPath = path.join(repoRoot, HELPER);
  const viewPath = path.join(repoRoot, VIEW);
  const offenders = [];
  if (!fs.existsSync(helperPath)) offenders.push(`${HELPER} — MISSING`);
  if (!fs.existsSync(viewPath)) offenders.push(`${VIEW} — MISSING`);
  if (offenders.length) {
    console.error("[verify-bank-register-sort-group] FAIL:");
    for (const o of offenders) console.error(`  - ${o}`);
    return { ok: false, offenders };
  }
  const results = checksFor(fs.readFileSync(helperPath, "utf8"), fs.readFileSync(viewPath, "utf8"));
  const failed = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([k]) => CHECK_LABELS[k]);
  if (failed.length) {
    console.error("[verify-bank-register-sort-group] FAIL — sort/group wiring regress:");
    for (const f of failed) console.error(`  - ${f}`);
    return { ok: false, offenders: failed };
  }
  console.log("[verify-bank-register-sort-group] PASS — wiring + QBO sort/group contract locked");
  return { ok: true, offenders: [] };
}

function selftest() {
  const rows = [
    { id: "a", transaction_date: "2026-01-15T00:00:00.000Z", amount_cents: 1000, is_credit: false },
    { id: "b", transaction_date: "2026-02-10T00:00:00.000Z", amount_cents: -500, is_credit: false },
    { id: "c", transaction_date: "2026-03-05T00:00:00.000Z", amount_cents: 2000, is_credit: false },
    { id: "d", transaction_date: "2026-03-20T00:00:00.000Z", amount_cents: -100, is_credit: true },
  ];
  // Sorted date ASC (oldest first) — as tableRows would be after sort.
  const asc = [...rows].sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : 1));
  const desc = [...rows].sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));

  const failures = [];

  const monthAsc = groupBankTransactions(asc, "month", { key: "date", dir: "asc" });
  if (monthAsc[0]?.key !== "2026-01") {
    failures.push(`date ASC month bands must start oldest-first (got ${monthAsc[0]?.key})`);
  }

  const monthDesc = groupBankTransactions(desc, "month", { key: "date", dir: "desc" });
  if (monthDesc[0]?.key !== "2026-03") {
    failures.push(`date DESC month bands must start newest-first (got ${monthDesc[0]?.key})`);
  }

  // Bug: page-then-group with ASC still shows newest month on page 1 when pageSize cuts early months.
  const manyAsc = [];
  for (let i = 1; i <= 60; i++) {
    const month = i <= 30 ? "01" : "03";
    manyAsc.push({
      id: `x${i}`,
      transaction_date: `2026-${month}-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      amount_cents: 100,
      is_credit: false,
    });
  }
  const buggy = buggyPageThenGroupNewestFirst(manyAsc, 1, 50);
  const fixed = buildPagedBankTxnGroups(manyAsc, "month", { key: "date", dir: "asc" }, 1, 50);
  if (buggy[0]?.key === "2026-01") {
    failures.push("buggy fixture should demonstrate newest-first-on-page regression");
  }
  if (fixed.groups[0]?.key !== "2026-01") {
    failures.push(`fixed ASC page1 must open on oldest month (got ${fixed.groups[0]?.key})`);
  }
  if (fixed.effectiveMode !== "month") {
    failures.push("date+month effectiveMode must stay month");
  }

  const money = groupBankTransactions(desc, "money", { key: "date", dir: "desc" });
  if (money.map((g) => g.key).join(",") !== "money_in,money_out") {
    failures.push(`money mode must emit money_in then money_out (got ${money.map((g) => g.key)})`);
  }
  if (money[0].rows.every((r) => isMoneyInTxn(r)) !== true) {
    failures.push("money_in band must only contain money-in rows");
  }

  const flat = resolveBankTxnGroupMode("month", { key: "amount", dir: "asc" });
  if (flat !== "none") failures.push("non-date sort with month mode must auto-flatten to none");

  const none = buildPagedBankTxnGroups(asc, "none", { key: "date", dir: "asc" }, 1, 10);
  if (none.groups.length !== 1 || none.groups[0].key !== "all") {
    failures.push("none mode must be a single flat All transactions band");
  }

  // Static checks against good/bad fixtures
  const goodHelper = `
    export function buildPagedBankTxnGroups() {}
    export function groupBankTransactions() {}
    export function resolveBankTxnGroupMode() {}
    const monthDir = sort.key === "date" && sort.dir === "asc" ? 1 : -1;
    if (mode === "month" && sort.key !== "date") return "none";
    bands.push({ key: "money_in", title: "Money in" });
    bands.push({ key: "money_out", title: "Money out" });
  `;
  const goodView = `
    import { buildPagedBankTxnGroups } from "./bankTxnSortGroup";
    const x = buildPagedBankTxnGroups(tableRows, mode, sortBy, page, size);
    <button>Money in/out</button>
    groupMode: "money"
    <button>All dates</button>
    turnOffGrouping: true
  `;
  const badView = `
    for (const tx of pagedRows) { bucket.set(monthKey(tx)); }
    .sort(([a], [b]) => (a < b ? 1 : -1))
  `;
  const g = checksFor(goodHelper, goodView);
  const b = checksFor("export function noop() {}", badView);
  for (const key of Object.keys(CHECK_LABELS)) {
    if (!g[key]) failures.push(`good fixture should PASS ${key}`);
    if (b[key]) failures.push(`bad fixture should FAIL ${key}`);
  }

  if (failures.length) {
    console.error("[verify-bank-register-sort-group] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-bank-register-sort-group] SELFTEST PASS — pipeline, month ASC, money bands, auto-flatten");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    selftest();
    process.exit(run().ok ? 0 : 1);
  }
}
