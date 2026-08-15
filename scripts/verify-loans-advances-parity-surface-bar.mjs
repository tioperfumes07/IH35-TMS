#!/usr/bin/env node
/**
 * ACCT-F3572 — LoansAdvancesPage register must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "LoansAdvancesPage: must use ParityTable");
  assert(src.includes('storageKey="loans-advances-register"'), "LoansAdvancesPage: storageKey loans-advances-register");
  assert(src.includes('tableTestId="loans-advances-register-table"'), "LoansAdvancesPage: tableTestId");
  assert(src.includes("listRelatedPartyLoans"), "LoansAdvancesPage: keep loans list API");
  assert(src.includes("LoanApplicationWizard"), "LoansAdvancesPage: keep create wizard");
  assert(!/<table\b/.test(src), "LoansAdvancesPage: must not use raw HTML table");
  assert(
    src.includes("No loans or advances recorded for this entity yet"),
    "LoansAdvancesPage: keep honest empty register copy",
  );
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function LoansAdvancesPage() {",
    '  return <table className="w-full" data-testid="loans-advances-register-table"><tbody /></table>;',
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
  console.log("verify-loans-advances-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-loans-advances-parity-surface-bar PASS");
}
