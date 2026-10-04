#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-reports-ap-aging-print-letter.mjs");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/APAgingPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

let throwOnFail = false;

function fail(msg) {
  if (throwOnFail) throw new Error(msg);
  console.error(`FAIL verify-reports-ap-aging-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource(pageText) {
  if (!fs.existsSync(PAGE)) fail("missing reports APAgingPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = pageText ?? fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("APAgingPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
  if (page.includes("text-[11px]")) fail("APAgingPage.tsx: must not use text-[11px] — use text-section-header");
  if (!page.includes("UnclearedDocumentsNote")) fail("APAgingPage must name uncleared documents via UnclearedDocumentsNote");
  if (!page.includes("not cleared")) fail("APAgingPage must label uncleared payments not cleared");
  if (!page.includes("cleared_open_cents")) fail("APAgingPage must show the cleared balance");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
  // Pure check on the planted text - no tracked file is ever written.
  const plantedText = planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`;
  throwOnFail = true;
  let detected = false;
  try {
    assertSource(plantedText);
  } catch {
    detected = true;
  } finally {
    throwOnFail = false;
  }
  if (!detected) fail("mutated still passed");
  console.log("PASS: verify-reports-ap-aging-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-reports-ap-aging-print-letter");
}
