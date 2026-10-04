#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-cash-flow-overview-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource(pageSrc, failFn = fail) {
  if (!fs.existsSync(PAGE)) failFn("missing CashFlowOverviewPage");
  if (!fs.existsSync(HELPER)) failFn("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) failFn("missing printLetterHtml");
  const page = pageSrc ?? fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) failFn("CashFlowOverviewPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) failFn("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) failFn("must not window.print() on SPA");
  leftoverRefuse(page, failFn);
}

function leftoverHits(src) {
  const bucket = [];
  if (src.includes("text-[11px]")) bucket.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) bucket.push("leftover off-scale muted");
  if (/fontSize:\s*10\b/.test(src)) bucket.push("leftover fontSize: 10");
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-")) {
    bucket.push("leftover slate class");
  }
  return bucket;
}

function leftoverRefuse(src, failFn = fail) {
  for (const e of leftoverHits(src)) failFn(`CashFlowOverviewPage.tsx: ${e}`);
}

function selftest() {
  assertSource();
  const leftoverPlant = `${fs.readFileSync(PAGE, "utf8")}\n<div className="text-[11px] text-slate-600 border-slate-300 bg-slate-50 text-[#8A92AB]" style={{ color: "#334155", fontSize: 10 }}>plant</div>`;
  const leftoverBad = leftoverHits(leftoverPlant);
  if (
    !leftoverBad.some((e) => e.includes("leftover text-[11px]")) ||
    !leftoverBad.some((e) => e.includes("leftover off-scale muted")) ||
    !leftoverBad.some((e) => e.includes("leftover fontSize: 10")) ||
    !leftoverBad.some((e) => e.includes("leftover slate class"))
  ) {
    fail("leftover plant escaped");
  }
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
  console.log("PASS: verify-cash-flow-overview-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-cash-flow-overview-print-letter");
}
