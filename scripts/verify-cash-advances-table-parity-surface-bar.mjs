#!/usr/bin/env node
/**
 * SETL-F3544 — CashAdvancesTable must use ParityTable (Search+Range+gear),
 * not a raw HTML table; parent must not empty-early-return past the table chrome.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx";
const HOME = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(tablePath = path.join(ROOT, TABLE)) {
  const table = fs.readFileSync(tablePath, "utf8");
  const home = fs.readFileSync(path.join(ROOT, HOME), "utf8");
  assert(table.includes("ParityTable"), "CashAdvancesTable: must use ParityTable");
  assert(table.includes('storageKey="cash-advances-roster"'), "CashAdvancesTable: must set storageKey");
  assert(table.includes('tableTestId="cash-advances-table"'), "CashAdvancesTable: must set tableTestId");
  assert(table.includes('data-testid="cash-advances-empty"'), "CashAdvancesTable: keep empty test id");
  assert(!/<table\b/.test(table), "CashAdvancesTable: must not use raw HTML table");
  assert(home.includes("<CashAdvancesTable"), "CashAdvancesHome: must mount CashAdvancesTable");
  assert(!/listState\.isEmpty \?/.test(home), "CashAdvancesHome: must not empty-early-return past table chrome");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy TABLE
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
// HOME is only ever read, both here and in check(), so it needs no temp copy.
async function selftest() {
  check();
  const realPath = path.join(ROOT, TABLE);
  const planted = [
    "export function CashAdvancesTable() {",
    '  return <table className="w-full" data-testid="cash-advances-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let failed = false;
  await withMutatedCopy(realPath, () => planted, (tmpPath) => {
    try {
      check(tmpPath);
    } catch {
      failed = true;
    }
  });
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-cash-advances-table-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-cash-advances-table-parity-surface-bar PASS");
}
