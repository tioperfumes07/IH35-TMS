#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-finance-statements-print-letter.mjs");
// Selftest points the child at a temp copy via this env var; the tracked page is never written.
const PAGE = process.env.IH35_SELFTEST_PAGE_PATH || path.join(ROOT, "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx");
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
  const planted = backup.replace(/onClick=\{printLetter\}/, "onClick={() => window.print()}");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-finance-statements-print-letter-"));
  const tmpPagePath = path.join(tmpDir, path.basename(PAGE));
  try {
    fs.writeFileSync(tmpPagePath, planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8", env: { ...process.env, IH35_SELFTEST_PAGE_PATH: tmpPagePath } });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("PASS: verify-finance-statements-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-finance-statements-print-letter");
}
