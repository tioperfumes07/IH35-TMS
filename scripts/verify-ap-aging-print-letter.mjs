#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-ap-aging-print-letter: ${msg}`);
  process.exit(1);
}

/** Pure check over the source text — selftests pass planted strings; nothing on disk is written. */
function checkSource(page, helper) {
  const errs = [];
  if (!helper.includes("export function printLetterHtml")) errs.push("missing printLetterHtml");
  if (!page.includes("printLetterHtml")) errs.push("AccountsPayableAgingPage must use printLetterHtml");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) errs.push("must not window.print() on SPA");
  if (!page.includes("UnclearedDocumentsNote")) errs.push("AccountsPayableAgingPage must name uncleared documents via UnclearedDocumentsNote");
  if (!page.includes("not cleared")) errs.push("AccountsPayableAgingPage must label uncleared payments not cleared");
  if (!page.includes("cleared_open_cents")) errs.push("AccountsPayableAgingPage must show the cleared balance");
  return errs;
}

function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing AccountsPayableAgingPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const errs = checkSource(fs.readFileSync(PAGE, "utf8"), fs.readFileSync(HELPER, "utf8"));
  if (errs.length) fail(errs[0]);
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const helper = fs.readFileSync(HELPER, "utf8");
  const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
  const mutated = planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`;
  if (!checkSource(mutated, helper).length) fail("mutated still passed");
  console.log("PASS: verify-ap-aging-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-ap-aging-print-letter");
}
