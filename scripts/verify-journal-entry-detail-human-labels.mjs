#!/usr/bin/env node
/** LST-F105 — JournalEntryDetailPage title/breadcrumb must not be bare UUID fragments. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const LABEL = "verify-journal-entry-detail-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/title=\{`Journal Entry \$\{entry\.id\.slice/.test(src) || /title=\{`Journal Entry \$\{entry\.id/.test(src)) {
    problems.push(`${FILE}: title still interpolates entry.id UUID fragment`);
  }
  if (/label:\s*entry\.id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: breadcrumb still uses entry.id.slice(0, 8)`);
  }
  if (!/journalEntryChromeLabel/.test(src)) {
    problems.push(`${FILE}: missing journalEntryChromeLabel helper`);
  }
  if (!/formatDateUS\(entry\.entry_date\)/.test(src) || !/journal_entry_type_code/.test(src)) {
    problems.push(`${FILE}: chrome label must use entry_date + type (not id)`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live
    .replace(/title=\{chromeLabel\}/, "title={`Journal Entry ${entry.id.slice(0, 8)}`}")
    .replace(/journalEntryChromeLabel/g, "removedHelper");
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
