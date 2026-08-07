#!/usr/bin/env node
/**
 * Book Load §E Documents chrome must not claim BOL/POD/lumper upload when only
 * rate-con OCR (OcrDropZone) is wired. Honesty line required.
 * Cursor even claim: 2384.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-documents-chrome-honesty";
const TARGET = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src) {
  const problems = [];
  const start = src.indexOf('data-testid="book-load-documents"');
  if (start < 0) {
    problems.push(`${TARGET}: missing data-testid=book-load-documents`);
    return problems;
  }
  const section = src.slice(start, start + 2500);
  if (/BOL\s*·\s*POD|BOL\s*\/\s*POD|lumper receipt/i.test(section) && !/book-load-documents-honesty/.test(section)) {
    problems.push(`${TARGET}: §E meta still lists BOL/POD/lumper without honesty pointer`);
  }
  if (/Upload rate confirmation\s*&amp;\s*documents|Upload rate confirmation & documents/i.test(section)) {
    problems.push(`${TARGET}: label must not claim generic "documents" upload — rate-con only`);
  }
  if (!/OcrDropZone/.test(section)) {
    problems.push(`${TARGET}: rate-con OcrDropZone must remain the wired upload control`);
  }
  if (!/book-load-documents-honesty/.test(section)) {
    problems.push(`${TARGET}: missing data-testid=book-load-documents-honesty pointer to Load Detail / POD Review`);
  }
  if (!/rate confirmation \(OCR prefill\)|rate confirmation \(OCR/i.test(section)) {
    problems.push(`${TARGET}: sec-meta must honestly say rate confirmation (OCR prefill)`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `
    <section data-testid="book-load-documents">
      <span class="blw-sec-meta">rate con · BOL · POD · lumper receipt</span>
      <label>Upload rate confirmation &amp; documents</label>
      <OcrDropZone />
    </section>`;
  const good = `
    <section data-testid="book-load-documents">
      <span class="blw-sec-meta">rate confirmation (OCR prefill)</span>
      <label>Upload rate confirmation</label>
      <OcrDropZone />
      <p data-testid="book-load-documents-honesty">BOL, POD on Load Detail</p>
    </section>`;
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 2 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
const src = fs.readFileSync(abs, "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Book Load §E documents chrome is rate-con-only + honesty pointer`);
