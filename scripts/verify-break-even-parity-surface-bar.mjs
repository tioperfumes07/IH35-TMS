#!/usr/bin/env node
/**
 * ACCT-F3576 — BreakEvenPage expense lines must use ParityTable (Search+Range+gear),
 * not a raw HTML table. Prefer embedded mode inside the single expense frame.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/finance/BreakEvenPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "BreakEvenPage: must use ParityTable");
  assert(src.includes('storageKey="break-even-expense-lines"'), "BreakEvenPage: storageKey");
  assert(src.includes('tableTestId="break-even-expense-lines-table"'), "BreakEvenPage: tableTestId");
  assert(src.includes("embedded"), "BreakEvenPage: ParityTable must be embedded in expense frame");
  assert(src.includes('data-testid="break-even-expense-frame"'), "BreakEvenPage: keep expense frame");
  assert(src.includes("getBreakEvenInputs"), "BreakEvenPage: keep break-even inputs API");
  assert(src.includes("toggleClass"), "BreakEvenPage: keep fixed/variable what-if toggle");
  assert(!/<table\b/.test(src), "BreakEvenPage: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function BreakEvenPage() {",
    '  return <table className="min-w-full" data-testid="break-even-expense-lines-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-break-even-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-break-even-parity-surface-bar PASS");
}
