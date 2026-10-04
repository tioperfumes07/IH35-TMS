#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/ProfitLossPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  throw new Error(`FAIL verify-profit-loss-print-letter: ${msg}`);
}

function assertSource(pageOverride) {
  if (!fs.existsSync(PAGE)) fail("missing ProfitLossPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = pageOverride ?? fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("ProfitLossPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
  if (page.includes("text-[11px]")) fail("ProfitLossPage.tsx: must not use text-[11px] — use text-section-header");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
  const plantedText = planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`;
  let rejected = false;
  try {
    assertSource(plantedText);
  } catch {
    rejected = true;
  }
  if (!rejected) fail("mutated still passed");
  console.log("PASS: verify-profit-loss-print-letter --selftest");
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    assertSource();
    console.log("PASS: verify-profit-loss-print-letter");
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
