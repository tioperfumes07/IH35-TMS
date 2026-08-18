#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-banking-print-letter.mjs");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");
const PAGES = [
  path.join(ROOT, "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx"),
  path.join(ROOT, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"),
];

function fail(msg) {
  console.error(`FAIL verify-banking-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  if (!helper.includes("orientation")) fail("printLetterHtml must accept orientation");
  for (const page of PAGES) {
    if (!fs.existsSync(page)) fail(`missing ${path.relative(ROOT, page)}`);
    const src = fs.readFileSync(page, "utf8");
    if (!src.includes("printLetterHtml")) fail(`${path.basename(page)} must use printLetterHtml`);
    if (/window\.setTimeout\(\(\) => window\.print\(\)/.test(src)) {
      fail(`${path.basename(page)} must not SPA window.print() after orientation`);
    }
    if (/applyPrintOrientationStyles/.test(src)) {
      fail(`${path.basename(page)} must not inject SPA print orientation styles`);
    }
  }
}

function selftest() {
  assertSource();
  const target = PAGES[0];
  const backup = fs.readFileSync(target, "utf8");
  try {
    const planted = `${backup}\nwindow.setTimeout(() => window.print(), 50);\n`;
    fs.writeFileSync(target, planted);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(target, backup);
  }
  console.log("PASS: verify-banking-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-banking-print-letter");
}
