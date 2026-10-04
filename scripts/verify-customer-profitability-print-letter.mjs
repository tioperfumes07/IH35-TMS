#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-customer-profitability-print-letter.mjs");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-customer-profitability-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing CustomerProfitabilityPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("CustomerProfitabilityPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
  leftoverRefuse(page);
}

function leftoverHits(src) {
  const bucket = [];
  if (src.includes("text-[11px]")) bucket.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) bucket.push("leftover off-scale muted");
  if (/fontSize:\s*10\b/.test(src)) bucket.push("leftover fontSize: 10");
  return bucket;
}

function leftoverRefuse(src) {
  for (const e of leftoverHits(src)) fail(`CustomerProfitabilityPage.tsx: ${e}`);
}

function selftest() {
  assertSource();
  const leftoverPlant = `${fs.readFileSync(PAGE, "utf8")}\n<div className="text-[11px] text-[#8A92AB]" style={{ color: "#334155", fontSize: 10 }}>plant</div>`;
  const leftoverBad = leftoverHits(leftoverPlant);
  if (
    !leftoverBad.some((e) => e.includes("leftover text-[11px]")) ||
    !leftoverBad.some((e) => e.includes("leftover off-scale muted")) ||
    !leftoverBad.some((e) => e.includes("leftover fontSize: 10"))
  ) {
    fail("leftover plant escaped");
  }
  const backup = fs.readFileSync(PAGE, "utf8");
  try {
    const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
    fs.writeFileSync(PAGE, planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(PAGE, backup);
  }
  console.log("PASS: verify-customer-profitability-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-customer-profitability-print-letter");
}
