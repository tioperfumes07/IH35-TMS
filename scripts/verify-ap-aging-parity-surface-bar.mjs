#!/usr/bin/env node
/**
 * ACCT-F3568 — AccountsPayableAgingPage By Vendor Type must use ParityTable
 * (Search+Range+gear), not a raw HTML grouped table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "AccountsPayableAgingPage: must use ParityTable");
  assert(src.includes('storageKey="acct-ap-aging-by-vendor"'), "AccountsPayableAgingPage: by-vendor storageKey");
  assert(src.includes('storageKey="acct-ap-aging-by-type"'), "AccountsPayableAgingPage: by-type storageKey");
  assert(src.includes('tableTestId="ap-aging-by-type-table"'), "AccountsPayableAgingPage: by-type tableTestId");
  assert(src.includes('data-testid="ap-aging-by-type-total"'), "AccountsPayableAgingPage: by-type TOTAL strip");
  assert(!/<table\b/.test(src), "AccountsPayableAgingPage: must not use raw HTML table");
  assert(!/GroupBlock/.test(src), "AccountsPayableAgingPage: remove hand-rolled GroupBlock");
  assert(src.includes("getApAgingByVendor"), "AccountsPayableAgingPage: keep aging API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function AccountsPayableAgingPage() {",
    '  return <table className="w-full" data-testid="ap-aging-by-type-table"><tbody /></table>;',
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
  console.log("verify-ap-aging-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-ap-aging-parity-surface-bar PASS");
}
