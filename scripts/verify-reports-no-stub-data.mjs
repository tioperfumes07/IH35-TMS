#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    failures.push(`missing file: ${relPath}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const stubImportPatterns = [
  /from\s+['"][^'"]*_stubs\//,
  /from\s+['"][^'"]*_mock\//,
  /require\s*\(\s*['"][^'"]*_stubs\//,
  /require\s*\(\s*['"][^'"]*_mock\//,
];

const hardcodedStubPatterns = [
  /\bSTUB_(ROWS|DATA|REPORT)\b/,
  /\bMOCK_REPORT_(ROWS|DATA)\b/,
  /return\s*\[\s*\{[^\}]*example:\s*true/,
];

const reportsRoutesDir = path.join(root, "apps/backend/src/reports");
for (const file of walk(reportsRoutesDir).filter((f) => f.endsWith(".routes.ts"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of stubImportPatterns) {
    if (pattern.test(source)) failures.push(`${path.relative(root, file)} imports stub/mock data`);
  }
  for (const pattern of hardcodedStubPatterns) {
    if (pattern.test(source)) failures.push(`${path.relative(root, file)} contains hardcoded stub payload`);
  }
}

const reportPagesDir = path.join(root, "apps/frontend/src/pages/reports");
for (const file of walk(reportPagesDir).filter((f) => /\.(tsx|ts)$/.test(f))) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of stubImportPatterns) {
    if (pattern.test(source)) failures.push(`${path.relative(root, file)} imports stub/mock data`);
  }
}

const runnerSource = read("apps/frontend/src/pages/reports/ReportsRunner.tsx");
if (runnerSource.includes('"ar-aging": "Phase 5')) {
  failures.push("ReportsRunner still marks ar-aging as phase-stub");
}

const librarySource = read("apps/backend/src/reports/shared.ts");
for (const reportId of ["profit-per-truck", "driver-settlement", "ar-aging", "maint-cost-unit", "dispatch-margin"]) {
  const idNeedle = `id: "${reportId}"`;
  if (!librarySource.includes(idNeedle)) {
    failures.push(`REPORT_LIBRARY missing ${reportId}`);
  }
  const idx = librarySource.indexOf(idNeedle);
  if (idx >= 0) {
    const slice = librarySource.slice(idx, idx + 220);
    if (slice.includes('status: "stub"')) {
      failures.push(`REPORT_LIBRARY marks ${reportId} as stub`);
    }
  }
}

const indexSource = read("apps/backend/src/reports/index.ts");
for (const register of ["registerReportsArAgingRoutes", "registerDispatchMarginRoutes"]) {
  if (!indexSource.includes(register)) {
    failures.push(`reports index missing ${register}`);
  }
}

if (failures.length > 0) {
  console.error("verify:reports-no-stub-data — FAILED");
  for (const msg of failures) console.error(`- ${msg}`);
  process.exit(1);
}

console.log("verify:reports-no-stub-data — OK");
