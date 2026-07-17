#!/usr/bin/env node
/**
 * verify-xlsx-upload-hardened.mjs — 0243-h2-1 / coder-work-order-t2-3-xlsx-cve
 *
 * SheetJS `xlsx@0.18.5` is CVE-laden on READ. Untrusted upload paths MUST NOT call
 * `XLSX.read` / import `xlsx`. They must use `safe-spreadsheet-parse` (exceljs +
 * magic-byte gate). Write/export usage of `xlsx` is residual and documented —
 * this guard only locks the upload attack surface.
 *
 *   node scripts/verify-xlsx-upload-hardened.mjs
 *   node scripts/verify-xlsx-upload-hardened.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-xlsx-upload-hardened";

const UPLOAD_PATHS = [
  "apps/backend/src/fuel/loves-upload.routes.ts",
  "apps/backend/src/fuel/fuel-transaction-import.routes.ts",
  "apps/backend/src/catalogs/excel-uploader.ts",
];

const SAFE_HELPER = "apps/backend/src/lib/safe-spreadsheet-parse.ts";
const HARDENING_DOC = "docs/specs/XLSX-UPLOAD-HARDENING-2026-07-17.md";

const FORBIDDEN_IMPORT = /from\s+["']xlsx["']|require\(\s*["']xlsx["']\s*\)/;
const FORBIDDEN_READ = /XLSX\s*\.\s*read\s*\(/;
const REQUIRES_SAFE = /safe-spreadsheet-parse|parseSpreadsheetBufferSafe/;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkUploadPath(rel, src) {
  const failures = [];
  if (FORBIDDEN_IMPORT.test(src)) {
    failures.push(`${rel}: imports vulnerable "xlsx" — use safe-spreadsheet-parse / exceljs`);
  }
  if (FORBIDDEN_READ.test(src)) {
    failures.push(`${rel}: calls XLSX.read on upload path — forbidden`);
  }
  if (!REQUIRES_SAFE.test(src) && !rel.endsWith("excel-uploader.ts")) {
    failures.push(`${rel}: must reference safe-spreadsheet-parse`);
  }
  // excel-uploader re-exports via parseSpreadsheetBuffer → must still call safe helper
  if (rel.endsWith("excel-uploader.ts") && !REQUIRES_SAFE.test(src)) {
    failures.push(`${rel}: parseSpreadsheetBuffer must delegate to parseSpreadsheetBufferSafe`);
  }
  return failures;
}

export function checkSafeHelper(src) {
  const failures = [];
  if (FORBIDDEN_IMPORT.test(src) || FORBIDDEN_READ.test(src)) {
    failures.push(`${SAFE_HELPER}: must not use SheetJS xlsx`);
  }
  if (!/exceljs/.test(src)) {
    failures.push(`${SAFE_HELPER}: must parse with exceljs`);
  }
  if (!/ZIP_SIG|0x50,\s*0x4b|PK/.test(src) && !/assertSpreadsheetMagicBytes/.test(src)) {
    failures.push(`${SAFE_HELPER}: must magic-byte gate uploads`);
  }
  if (!/assertSpreadsheetMagicBytes/.test(src)) {
    failures.push(`${SAFE_HELPER}: missing assertSpreadsheetMagicBytes`);
  }
  return failures;
}

function run() {
  const failures = [];

  if (!fs.existsSync(path.join(ROOT, SAFE_HELPER))) {
    failures.push(`missing ${SAFE_HELPER}`);
  } else {
    failures.push(...checkSafeHelper(read(SAFE_HELPER)));
  }

  if (!fs.existsSync(path.join(ROOT, HARDENING_DOC))) {
    failures.push(`missing residual-risk doc ${HARDENING_DOC}`);
  } else {
    const doc = read(HARDENING_DOC);
    if (!/Residual risk/i.test(doc) || !/xlsx@/.test(doc)) {
      failures.push(`${HARDENING_DOC}: must document residual xlsx write/export risk`);
    }
  }

  for (const rel of UPLOAD_PATHS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      failures.push(`missing upload path ${rel}`);
      continue;
    }
    failures.push(...checkUploadPath(rel, read(rel)));
  }

  return failures;
}

function selftest() {
  let failed = 0;
  const bad = `import * as XLSX from "xlsx";\nconst wb = XLSX.read(buf, { type: "buffer" });\n`;
  const badHits = checkUploadPath("fake/loves-upload.routes.ts", bad);
  if (badHits.length < 2) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect raw XLSX.read import`);
    failed += 1;
  }
  const good = `import { parseSpreadsheetBufferSafe } from "../lib/safe-spreadsheet-parse.js";\nawait parseSpreadsheetBufferSafe(buf, name);\n`;
  const goodHits = checkUploadPath("fake/loves-upload.routes.ts", good);
  if (goodHits.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — false positive on safe helper: ${goodHits.join("; ")}`);
    failed += 1;
  }
  const helperBad = checkSafeHelper(`import * as XLSX from "xlsx";\nXLSX.read(b);\n`);
  if (helperBad.length < 1) {
    console.error(`${LABEL} SELFTEST FAIL — helper check missed SheetJS`);
    failed += 1;
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — upload paths use exceljs+magic-byte helper; no raw XLSX.read (residual write/export xlsx documented)`
  );
}
