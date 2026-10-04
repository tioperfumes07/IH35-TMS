#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-account-register-print-letter: ${msg}`);
  process.exit(1);
}

/** Pure check over the source text — selftests pass planted strings; nothing on disk is written. */
function checkSource(page, helper) {
  const errs = [];
  if (!helper.includes("export function printLetterHtml")) errs.push("missing printLetterHtml");
  if (!page.includes("printLetterHtml")) errs.push("AccountRegisterPage must use printLetterHtml");
  if (/const printList = \(\) => window\.print\(\)/.test(page)) errs.push("must not window.print() on SPA");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) errs.push("must not window.print() on SPA");
  return errs;
}

function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing AccountRegisterPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const errs = checkSource(fs.readFileSync(PAGE, "utf8"), fs.readFileSync(HELPER, "utf8"));
  if (errs.length) fail(errs[0]);
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const helper = fs.readFileSync(HELPER, "utf8");
  const planted = backup.replace(
    /const printList = \(\) => \{[\s\S]*?\n  \};/,
    "const printList = () => window.print();",
  );
  const mutated = planted.includes("window.print()") ? planted : `${backup}\nconst printList = () => window.print();\n`;
  if (!checkSource(mutated, helper).length) fail("mutated still passed");
  console.log("PASS: verify-account-register-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-account-register-print-letter");
}
