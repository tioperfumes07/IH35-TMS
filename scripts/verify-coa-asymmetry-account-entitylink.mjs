#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^accounting\\.panel\\.coa_asymmetry_report$","task":"LINK-F5171-COA-ASYMMETRY-ACCOUNT-DRILL","vertical":"column-wave"} */
/**
 * CoA asymmetry sample rows must EntityLink kind=account using account_id from the
 * read-only report (not entityLabel(name, null)).
 *
 * Run: node scripts/verify-coa-asymmetry-account-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-asymmetry-account-entitylink";
const PANEL = "apps/frontend/src/pages/accounting/CoaAsymmetryReportPanel.tsx";
const API = "apps/frontend/src/api/coaAsymmetryReport.ts";
const SVC = "apps/backend/src/accounting/coa-asymmetry-report.service.ts";

function audit(panel, api, svc) {
  const failures = [];
  if (!/account_id:\s*string/.test(api)) failures.push(`${API}: CoaAsymmetrySampleRow must declare account_id`);
  if (!/account_id:\s*String\(row\.account_id\)/.test(svc)) {
    failures.push(`${SVC}: sample map must include account_id`);
  }
  if (!/a\.id AS account_id/.test(svc)) failures.push(`${SVC}: sample SQL must SELECT a.id AS account_id`);
  if (/entityLabel\(row\.account_name,\s*null/.test(panel)) {
    failures.push(`${PANEL}: account still entityLabel(..., null)`);
  }
  if (!/kind=["']account["']/.test(panel) || !/id=\{row\.account_id\}/.test(panel)) {
    failures.push(`${PANEL}: must EntityLink kind=account with row.account_id`);
  }
  if (!/data-testid=["']coa-asymmetry-account-link["']/.test(panel)) {
    failures.push(`${PANEL}: missing data-testid=coa-asymmetry-account-link`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const panel = fs.readFileSync(path.join(ROOT, PANEL), "utf8");
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  const svc = fs.readFileSync(path.join(ROOT, SVC), "utf8");
  if (audit(panel, api, svc).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    console.error(audit(panel, api, svc));
    process.exit(1);
  }
  const broken = panel.replace(/kind=["']account["']/, 'kind="vendor"');
  if (!audit(broken, api, svc).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted kind regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const panel = fs.readFileSync(path.join(ROOT, PANEL), "utf8");
const api = fs.readFileSync(path.join(ROOT, API), "utf8");
const svc = fs.readFileSync(path.join(ROOT, SVC), "utf8");
const failures = audit(panel, api, svc);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — CoA asymmetry sample account EntityLink`);
