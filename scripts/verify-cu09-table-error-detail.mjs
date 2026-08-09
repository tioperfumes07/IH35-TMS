#!/usr/bin/env node
/** LST-F148 / CU-09 — formatQueryErrorDetail uses userFacingApiError (never data.error first). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-table-error-detail";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/lib/tableError.ts";

function assertSrc(src) {
  const problems = [];
  if (!/userFacingApiError\(/.test(src)) problems.push("missing userFacingApiError");
  if (/rec\.error\s*\?\?\s*rec\.message/.test(src) || /data\.error\s*\?\?\s*data\.message/.test(src)) {
    problems.push("still prefers error over message");
  }
  if (!/from\s+["'].*api-error-message["']/.test(src)) {
    problems.push("missing api-error-message import");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const live = read();
  const planted = live
    .replace(/userFacingApiError\([^)]+\)/g, "String((error as any).message)")
    .replace(
      /return \{\s*status: error\.status,\s*message: truncateErrorDetail\([^)]+\),\s*\};/s,
      'const rec = data as Record<string, unknown>;\n    const err = rec.error ?? rec.message;\n    return { status: error.status, message: String(err) };',
    );
  if (!assertSrc(planted).length) {
    // stronger plant
    const planted2 = `export function formatQueryErrorDetail(error: unknown) {\n  const rec = (error as any).data;\n  const err = rec.error ?? rec.message;\n  return { status: 0, message: String(err) };\n}\n`;
    if (!assertSrc(planted2).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  }
  const problems = assertSrc(live);
  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${problems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertSrc(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
