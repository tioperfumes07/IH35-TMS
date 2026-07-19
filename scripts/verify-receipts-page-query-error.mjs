#!/usr/bin/env node
// verify:receipts-page-query-error
// Guard: Receipts list/detail query failures must surface ListErrorBanner + retry,
// and must not show a false "No receipts found" empty table on list error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/ReceiptsPage.tsx";
const TEST = "apps/frontend/src/pages/accounting/__tests__/ReceiptsPage.queryError.test.tsx";

if (process.argv.includes("--selftest")) {
  const plantedFail = `
    {isError ? <p className="text-sm text-red-600">Failed to load receipts.</p> : null}
    <ParityTable emptyText="No receipts found." />
  `;
  const failures = checkSources({ page: plantedFail, test: "" });
  if (failures.length === 0) {
    console.error("selftest FAIL — planted silent list error was not detected");
    process.exit(1);
  }
  console.log("verify:receipts-page-query-error --selftest PASS");
  process.exit(0);
}

function checkSources({ page, test }) {
  const failures = [];

  if (!page.includes('from "../../components/shared/ListErrorBanner"')) {
    failures.push("ReceiptsPage must import ListErrorBanner");
  }
  if (!/message=["']Failed to load receipts\.["']/.test(page)) {
    failures.push("list query error must use ListErrorBanner message Failed to load receipts.");
  }
  if (!/onRetry=\{\(\)\s*=>\s*void listQuery\.refetch\(\)\}/.test(page)) {
    failures.push("list query error must retry via listQuery.refetch()");
  }
  if (!/\{!isError\s*\?\s*\(\s*<ParityTable/.test(page)) {
    failures.push("ParityTable must not render while listQuery isError (false empty state)");
  }
  if (/isError\s*\?\s*<p className="text-sm text-red-600/.test(page)) {
    failures.push("static red <p> list error is forbidden — use ListErrorBanner");
  }
  if (!/message=["']Failed to load receipt\.["']/.test(page)) {
    failures.push("detail query error must use ListErrorBanner message Failed to load receipt.");
  }
  if (!/onRetry=\{\(\)\s*=>\s*void detailQuery\.refetch\(\)\}/.test(page)) {
    failures.push("detail query error must retry via detailQuery.refetch()");
  }
  if (!test.includes("Failed to load receipts") || !test.includes("parity-table") || !test.includes("refetch")) {
    failures.push("focused ReceiptsPage.queryError.test.tsx must cover banner, hidden table, and retry");
  }

  return failures;
}

const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const test = fs.readFileSync(path.join(ROOT, TEST), "utf8");
const failures = checkSources({ page, test });

if (failures.length > 0) {
  console.error("verify:receipts-page-query-error FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:receipts-page-query-error PASS");
