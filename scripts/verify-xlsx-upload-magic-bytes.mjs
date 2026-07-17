#!/usr/bin/env node
/**
 * 0091-h2-1 / 0243-h2-1 — untrusted spreadsheet uploads must pass magic-byte validation
 * before any xlsx parse, and must route through lib/untrusted-spreadsheet-read.ts.
 *
 * Residual: xlsx@0.18.5 remains for .csv/.xls gated paths only (no patched SheetJS on npm).
 * .xlsx uploads use exceljs.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-xlsx-upload-magic-bytes";

const UPLOAD_ROUTE_FILES = [
  "apps/backend/src/catalogs/excel-uploader.ts",
  "apps/backend/src/fuel/loves-upload.routes.ts",
  "apps/backend/src/fuel/fuel-transaction-import.routes.ts",
];

const GATE_FILE = "apps/backend/src/lib/untrusted-spreadsheet-read.ts";
const BYTES_FILE = "apps/backend/src/lib/spreadsheet-upload-bytes.ts";

/** Trusted local tooling / export-only — not user upload ingress. */
const XLSX_READ_ALLOWLIST = [
  "apps/backend/src/lib/untrusted-spreadsheet-read.ts",
  "scripts/sync-program-board.mjs",
];

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`${LABEL} FAIL: missing ${rel}`);
  }
  return fs.readFileSync(full, "utf8");
}

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkTsFiles(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function checkUploadWiring() {
  const failures = [];
  for (const rel of UPLOAD_ROUTE_FILES) {
    const src = read(rel);
    if (/\bXLSX\.read\b/.test(src)) {
      failures.push(`${rel} must not call XLSX.read directly — use readUntrustedSpreadsheetRows`);
    }
    if (!src.includes("readUntrustedSpreadsheetRows") && !src.includes("parseSpreadsheetBuffer")) {
      failures.push(`${rel} must route uploads through the gated reader`);
    }
  }
  return failures;
}

export function checkGateModuleFromSrc(gate, bytes) {
  const failures = [];
  if (!gate.includes("validateSpreadsheetUploadBytes(")) {
    failures.push(`${GATE_FILE} must call validateSpreadsheetUploadBytes before parse`);
  }
  if (!gate.includes("exceljs")) {
    failures.push(`${GATE_FILE} must use exceljs for .xlsx untrusted uploads`);
  }
  if (!bytes.includes("hasZipSpreadsheetMagic")) {
    failures.push(`${BYTES_FILE} must define ZIP magic-byte check for .xlsx`);
  }
  if (!/\bXLSX\.read\b/.test(gate)) {
    failures.push(`${GATE_FILE} must centralize residual xlsx reads for csv/xls behind the gate`);
  }
  return failures;
}

export function checkGateModule() {
  return checkGateModuleFromSrc(read(GATE_FILE), read(BYTES_FILE));
}

export function checkNoUngatedXlsxRead() {
  const failures = [];
  const backendSrc = path.join(ROOT, "apps/backend/src");
  for (const file of walkTsFiles(backendSrc)) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const src = fs.readFileSync(file, "utf8");
    if (!/\bXLSX\.read\b/.test(src)) continue;
    if (XLSX_READ_ALLOWLIST.includes(rel)) continue;
    failures.push(`${rel} calls XLSX.read outside the upload gate allowlist`);
  }
  return failures;
}

export function runChecks() {
  return [...checkUploadWiring(), ...checkGateModule(), ...checkNoUngatedXlsxRead()];
}

function selftest() {
  const good = runChecks();
  if (good.length) {
    console.error(`${LABEL} --selftest FAILED: clean tree should pass but got:`, good);
    process.exit(1);
  }

  const badGate = read(GATE_FILE).replace("validateSpreadsheetUploadBytes(buffer, filename)", "// gated");
  const gateFailures = checkGateModuleFromSrc(badGate, read(BYTES_FILE));
  if (gateFailures.length === 0) {
    console.error(`${LABEL} --selftest FAILED: injected gate regression did not fail`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = runChecks();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
