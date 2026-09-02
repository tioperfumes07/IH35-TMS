#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-fuel-reconciliation-print-letter: ${msg}`);
  process.exit(1);
}

function validateSource({ page, helper }) {
  const failures = [];
  if (!helper.includes("export function printLetterHtml")) failures.push("missing printLetterHtml");
  if (!page.includes("printLetterHtml")) failures.push("FuelReconciliationPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) failures.push("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) failures.push("must not window.print() on SPA");
  return failures;
}

function readSource() {
  if (!fs.existsSync(PAGE)) fail("missing FuelReconciliationPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  return {
    page: fs.readFileSync(PAGE, "utf8"),
    helper: fs.readFileSync(HELPER, "utf8"),
  };
}

function assertSource() {
  const failures = validateSource(readSource());
  if (failures.length > 0) fail(failures.join("; "));
}

function selftest() {
  assertSource();
  const source = readSource();
  const plantedPage = source.page.replace(
    /onClick=\{printLetter\}/,
    "onClick={() => window.print()}"
  );
  const plantedFailures = validateSource({ ...source, page: plantedPage });
  if (plantedFailures.length < 2) fail("planted SPA print regression was not fully detected");
  console.log(
    `PASS: verify-fuel-reconciliation-print-letter --selftest (${plantedFailures.length} planted failures detected)`
  );
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-fuel-reconciliation-print-letter");
}
