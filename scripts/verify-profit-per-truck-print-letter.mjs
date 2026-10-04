#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  throw new Error(`FAIL verify-profit-per-truck-print-letter: ${msg}`);
}

function assertSource(pageOverride) {
  if (!fs.existsSync(PAGE)) fail("missing ProfitPerTruckPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = pageOverride ?? fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("ProfitPerTruckPage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
  leftoverRefuse(page);
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

function leftoverRefuse(src) {
  for (const e of leftoverHits(src)) fail(`ProfitPerTruckPage.tsx: ${e}`);
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
  const plantedText = planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`;
  let rejected = false;
  try {
    assertSource(plantedText);
  } catch {
    rejected = true;
  }
  if (!rejected) fail("mutated still passed");
  console.log("PASS: verify-profit-per-truck-print-letter --selftest");
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    assertSource();
    console.log("PASS: verify-profit-per-truck-print-letter");
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
