#!/usr/bin/env node
/**
 * ACCT-F3586 — CostBreakdownBox Section A must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CostBreakdownBox: must use ParityTable");
  assert(src.includes("cost-breakdown-section-a-"), "CostBreakdownBox: section A storageKey");
  assert(src.includes('tableTestId="cost-breakdown-section-a-table"'), "CostBreakdownBox: tableTestId");
  assert(src.includes("embedded"), "CostBreakdownBox: ParityTable must be embedded");
  assert(src.includes("MoneyInput"), "CostBreakdownBox: keep MoneyInput on unit cost");
  assert(src.includes("ReferenceSelect"), "CostBreakdownBox: keep category ReferenceSelect");
  assert(!/<table\b/.test(src), "CostBreakdownBox: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function CostBreakdownBox() {",
    '  return <table className="min-w-full" data-testid="cost-breakdown-section-a-table"><tbody /></table>;',
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
  console.log("verify-cost-breakdown-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-cost-breakdown-parity-surface-bar PASS");
}
