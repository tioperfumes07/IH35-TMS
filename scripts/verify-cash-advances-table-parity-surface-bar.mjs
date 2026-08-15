#!/usr/bin/env node
/**
 * SETL-F3544 — CashAdvancesTable must use ParityTable (Search+Range+gear),
 * not a raw HTML table; parent must not empty-early-return past the table chrome.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx";
const HOME = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const table = fs.readFileSync(path.join(ROOT, TABLE), "utf8");
  const home = fs.readFileSync(path.join(ROOT, HOME), "utf8");
  assert(table.includes("ParityTable"), "CashAdvancesTable: must use ParityTable");
  assert(table.includes('storageKey="cash-advances-roster"'), "CashAdvancesTable: must set storageKey");
  assert(table.includes('tableTestId="cash-advances-table"'), "CashAdvancesTable: must set tableTestId");
  assert(table.includes('data-testid="cash-advances-empty"'), "CashAdvancesTable: keep empty test id");
  assert(!/<table\b/.test(table), "CashAdvancesTable: must not use raw HTML table");
  assert(home.includes("<CashAdvancesTable"), "CashAdvancesHome: must mount CashAdvancesTable");
  assert(!/listState\.isEmpty \?/.test(home), "CashAdvancesHome: must not empty-early-return past table chrome");
}

function selftest() {
  check();
  const tablePath = path.join(ROOT, TABLE);
  const good = fs.readFileSync(tablePath, "utf8");
  const planted = [
    "export function CashAdvancesTable() {",
    '  return <table className="w-full" data-testid="cash-advances-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(tablePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(tablePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-cash-advances-table-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-cash-advances-table-parity-surface-bar PASS");
}
