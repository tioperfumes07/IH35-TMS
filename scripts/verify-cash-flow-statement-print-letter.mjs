#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-cash-flow-statement-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource(pageSrc, failFn = fail) {
  if (!fs.existsSync(PAGE)) failFn("missing CashFlowStatementPage");
  if (!fs.existsSync(HELPER)) failFn("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) failFn("missing printLetterHtml");
  const page = pageSrc ?? fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) failFn("CashFlowStatementPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) failFn("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) failFn("must not window.print() on SPA");
  if (page.includes("text-[11px]")) failFn("CashFlowStatementPage.tsx: must not use text-[11px] — use text-section-header");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
  let caught = false;
  try {
    assertSource(
      planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`,
      (msg) => {
        throw new Error(msg);
      },
    );
  } catch {
    caught = true;
  }
  if (!caught) fail("mutated still passed");
  console.log("PASS: verify-cash-flow-statement-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-cash-flow-statement-print-letter");
}
