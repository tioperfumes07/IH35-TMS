#!/usr/bin/env node
// ROUND 300 (CC-1, proven on a Neon fork) — reversing a prepaid-amortization / depreciation schedule row posts the
// canonical linked reversal (reverseJournalEntryNoFlip) and NEVER flips the original JE to status='voided'. The flip
// made the trial balance / P&L / balance sheet (which skip voided JEs) drop the original and still count the
// reversal: the amount came off twice (fork: Truck Depreciation −450,000c). Fails if reverseSchedule calls
// postVoidReversal again, writes status = 'voided' onto journal_entries, or stops using reverseJournalEntryNoFlip.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-schedule-reversal-never-flips";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(src) {
  const c = strip(src);
  const start = c.indexOf("async function reverseSchedule(");
  if (start < 0) return [`${FILE}: reverseSchedule not found`];
  const body = c.slice(start, c.indexOf("\nexport async function", start + 10) > 0 ? c.indexOf("\nexport async function", start + 10) : undefined);
  const p = [];
  if (!/await reverseJournalEntryNoFlip\(/.test(body)) p.push(`${FILE}: reverseSchedule must use reverseJournalEntryNoFlip (linked reversal, original never flipped)`);
  if (/postVoidReversal\(/.test(body)) p.push(`${FILE}: reverseSchedule calls postVoidReversal again`);
  if (/UPDATE accounting\.journal_entries[\s\S]{0,120}status = 'voided'/.test(body)) p.push(`${FILE}: reverseSchedule flips the original JE to status='voided' (reports would count the reversal twice)`);
  return p;
}

export function run() { return problems(readFileSync(path.join(ROOT, FILE), "utf8")); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const flip = src.replace("const reversal = { reversal_journal_entry_id:", "await client.query(`UPDATE accounting.journal_entries SET status = 'voided' WHERE id = $1`, [jeId]);\n      const reversal = { reversal_journal_entry_id:");
    if (!problems(flip).length) { console.error(`${LABEL} --selftest FAIL — flip not caught`); process.exit(1); }
    if (!problems(src.replace("await reverseJournalEntryNoFlip(", "await somethingElse(")).length) { console.error(`${LABEL} --selftest FAIL — missing linked reversal not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — schedule reversal posts a linked reversal and never flips the original JE.`);
}
