#!/usr/bin/env node
/**
 * ACCT-F3572 — LoansAdvancesPage register must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
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

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const planted = [
    "export function LoansAdvancesPage() {",
    '  return <table className="w-full" data-testid="loans-advances-register-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-loans-advances-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-loans-advances-parity-surface-bar PASS");
}
