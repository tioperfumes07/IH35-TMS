#!/usr/bin/env node
/**
 * SAF-B31 (export slice) — GET /api/v1/safety/reports/:report_id/export.xlsx must export real
 * company-scoped rollup rows, never a hardcoded ["safety.sample", 0] success workbook.
 *
 * THE DEFECT (main @ 2531661a1): renderSafetyReportXlsx() took zero args, ignored operating_company_id
 * and report_id, and always wrote safety.sample. The JSON reader beside it already queried
 * audit.audit_events — export was dishonest theater.
 *
 * Self-test plants the exact defect into the real routes file and requires this guard to FAIL, then
 * restores byte-for-byte.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/safety/reports/safety-reports.routes.ts";

/** Pre-fix stub body — the guard must reject any resurrection of this pattern. */
const FABRICATED_SAMPLE = '["safety.sample", 0]';

export function run(root = ROOT) {
  const failures = [];
  const abs = path.join(root, ROUTES);
  if (!fs.existsSync(abs)) {
    failures.push(`missing ${ROUTES}`);
    return failures;
  }
  const src = fs.readFileSync(abs, "utf8");

  if (src.includes(FABRICATED_SAMPLE) || src.includes("safety.sample")) {
    failures.push(
      `${ROUTES}: must not hardcode safety.sample — fabricated export rows on a compliance screen are worse than an empty sheet`
    );
  }

  if (!/export async function renderSafetyReportXlsx\s*\(\s*rows\s*:/.test(src)) {
    failures.push(`${ROUTES}: renderSafetyReportXlsx(rows) must accept the queried rollup rows — a zero-arg stub cannot be honest`);
  }

  if (!/function authUser\s*\(/.test(src) || !src.includes("requireAuth")) {
    failures.push(`${ROUTES}: export route must require auth (requireAuth / authUser)`);
  }

  if (!src.includes("async function fetchSafetyReportRows")) {
    failures.push(`${ROUTES}: must share fetchSafetyReportRows between JSON and XLSX export`);
  }

  if (!/withCompanyScope\s*\(\s*user\.uuid/.test(src)) {
    failures.push(`${ROUTES}: export must scope reads with withCompanyScope(user.uuid, operating_company_id, …)`);
  }

  const exportBlock = src.match(
    /app\.get\(\s*"\/api\/v1\/safety\/reports\/:report_id\/export\.xlsx"[\s\S]*?\n  \)\s*;/
  )?.[0];
  if (!exportBlock) {
    failures.push(`${ROUTES}: missing GET /api/v1/safety/reports/:report_id/export.xlsx route`);
  } else {
    if (!exportBlock.includes("authUser(req, reply)")) {
      failures.push(`${ROUTES}: export.xlsx handler must call authUser before streaming a workbook`);
    }
    if (!exportBlock.includes("fetchSafetyReportRows")) {
      failures.push(`${ROUTES}: export.xlsx must query fetchSafetyReportRows — not a static workbook`);
    }
    if (!/renderSafetyReportXlsx\s*\(\s*rows\s*\)/.test(exportBlock)) {
      failures.push(`${ROUTES}: export.xlsx must call renderSafetyReportXlsx(rows) with the scoped query result`);
    }
    if (/renderSafetyReportXlsx\s*\(\s*\)/.test(exportBlock)) {
      failures.push(`${ROUTES}: export.xlsx must not call zero-arg renderSafetyReportXlsx()`);
    }
    // CodeQL js/missing-rate-limiting — authorized export must be rate-limited.
    if (!/rateLimit\s*:\s*\{\s*max\s*:/.test(exportBlock)) {
      failures.push(`${ROUTES}: export.xlsx must set config.rateLimit (CodeQL js/missing-rate-limiting)`);
    }
  }

  const jsonBlock = src.match(
    /app\.get\(\s*"\/api\/v1\/safety\/reports\/:report_id"[\s\S]*?\n  \)\s*;/
  )?.[0];
  if (jsonBlock && !/rateLimit\s*:\s*\{\s*max\s*:/.test(jsonBlock)) {
    failures.push(`${ROUTES}: JSON report route must set config.rateLimit`);
  }

  return failures;
}

function selftest() {
  const clean = run();
  if (clean.length) {
    console.error("SELFTEST FAIL: repository already fails before mutation:\n  - " + clean.join("\n  - "));
    process.exit(1);
  }

  const abs = path.join(ROOT, ROUTES);
  const original = fs.readFileSync(abs, "utf8");
  const planted = original.replace(
    /export async function renderSafetyReportXlsx[\s\S]*?\n\}/,
    `export async function renderSafetyReportXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addArrayWorksheet(workbook, "Safety Report", [
    ["event_class", "total"],
    ${FABRICATED_SAMPLE},
  ]);
  return writeWorkbookBuffer(workbook);
}`
  );

  if (planted === original) {
    console.error("SELFTEST FAIL: could not plant safety.sample defect into routes file");
    process.exit(1);
  }

  let caught;
  try {
    fs.writeFileSync(abs, planted, "utf8");
    caught = run();
  } finally {
    fs.writeFileSync(abs, original, "utf8");
  }

  if (caught.length === 0) {
    console.error("SELFTEST FAIL: planted safety.sample stub and guard still passed");
    process.exit(1);
  }
  if (!caught.some((f) => f.includes("safety.sample"))) {
    console.error("SELFTEST FAIL: guard did not name safety.sample:\n  - " + caught.join("\n  - "));
    process.exit(1);
  }

  const after = run();
  if (after.length) {
    console.error("SELFTEST FAIL: restore did not return repository to green:\n  - " + after.join("\n  - "));
    process.exit(1);
  }

  console.log("verify-saf-b31-safety-report-export-honesty --selftest OK (planted safety.sample FAIL, fix PASS)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-saf-b31-safety-report-export-honesty FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-saf-b31-safety-report-export-honesty — OK (XLSX export uses scoped rollup rows, no safety.sample stub)");
}
