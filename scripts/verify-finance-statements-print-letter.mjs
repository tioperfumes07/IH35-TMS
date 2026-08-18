#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-finance-statements-print-letter.mjs");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-finance-statements-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing FinancialStatementsPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("FinancialStatementsPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  try {
    const planted = backup.replace(/onClick=\{printLetter\}/, "onClick={() => window.print()}");
    fs.writeFileSync(PAGE, planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(PAGE, backup);
  }
  console.log("PASS: verify-finance-statements-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-finance-statements-print-letter");
}
