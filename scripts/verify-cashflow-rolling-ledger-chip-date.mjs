#!/usr/bin/env node
/**
 * Rolling Ledger day-grid chip dates must be weekday + MM/DD/YYYY (Round 7.6),
 * not weekday + MM-DD (Codex QA residual after #28050/#28087).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cashflow-rolling-ledger-chip-date";
const FILE = "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx";

function audit(src) {
  const fails = [];
  if (!/function fmtChipDate\(iso: string\)/.test(src)) {
    fails.push(`${FILE}: missing fmtChipDate`);
  }
  if (!/formatDateUS\(iso\)/.test(src)) {
    fails.push(`${FILE}: fmtChipDate must call formatDateUS`);
  }
  // Forbidden: bare MM-DD chip assembly (padStart month-day without year).
  if (/padStart\(2,\s*"0"\)\}\$\{[^}]*\}-\$\{/.test(src) || /\$\{String\(m\)\.padStart\(2,\s*"0"\)\}-\$\{String\(d\)/.test(src)) {
    fails.push(`${FILE}: still builds weekday+MM-DD chip (must be MM/DD/YYYY via formatDateUS)`);
  }
  if (!/`\$\{wd\} \$\{us\}`/.test(src) && !/`\$\{wd\} \$\{formatDateUS/.test(src)) {
    fails.push(`${FILE}: chip must render "weekday MM/DD/YYYY"`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = `
function fmtChipDate(iso: string) {
  const us = formatDateUS(iso);
  return us ? \`\${wd} \${us}\` : "—";
}
`;
  if (audit(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(audit(good)));
  const bad = `
function fmtChipDate(iso: string) {
  return \`\${wd} \${String(m).padStart(2, "0")}-\${String(d).padStart(2, "0")}\`;
}
`;
  if (audit(bad).length === 0) throw new Error("SELFTEST FAIL: MM-DD chip undetected");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const fails = audit(src);
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Rolling Ledger chip dates use weekday + formatDateUS (MM/DD/YYYY)`);
