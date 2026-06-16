#!/usr/bin/env node
/**
 * FH-2 Loan Wizard boundary guard (Tier-3 integrity).
 * The Loan Wizard ships PREVIEW/COMPUTE-ONLY: it may COMPUTE a balanced opening JE and return it
 * as data, but it must perform ZERO ledger writes and never touch the posting engine. This guard
 * FAILS if any FH-2 file references posting_batches / journal_entry_postings, writes into
 * accounting.* (INSERT/UPDATE/DELETE), or calls the posting engine. It is what keeps FH-2 honest:
 * a later edit cannot silently turn it into a money-path feature without removing this guard
 * (which is itself reviewable). Posting is a SEPARATE Tier-1 PR behind FINANCE_HUB_LOAN_WIZARD_ENABLED.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// FH-2 source surface (backend service/routes + the flag migration).
const FH2_DIR = path.join(ROOT, "apps/backend/src/finance/loan-wizard");
const FH2_MIGRATION = path.join(ROOT, "db/migrations/202606160000_fh2_loan_wizard_flag.sql");

let failed = 0;
const fail = (m) => { console.error(`verify-fh2-no-posting: ${m}`); failed = 1; };

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|mts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = [...walk(FH2_DIR), ...(fs.existsSync(FH2_MIGRATION) ? [FH2_MIGRATION] : [])];
if (files.length === 0) fail("no FH-2 files found to scan (expected apps/backend/src/finance/loan-wizard/*)");

// Forbidden — any of these in an FH-2 file means the no-posting boundary was crossed.
const FORBIDDEN = [
  { re: /posting_batches/i, why: "references accounting.posting_batches" },
  { re: /journal_entry_postings/i, why: "references accounting.journal_entry_postings" },
  { re: /\bINSERT\s+INTO\s+accounting\./i, why: "INSERT INTO accounting.*" },
  { re: /\bUPDATE\s+accounting\./i, why: "UPDATE accounting.*" },
  { re: /\bDELETE\s+FROM\s+accounting\./i, why: "DELETE FROM accounting.*" },
  { re: /postSourceTransaction|reversePostedSourceTransaction|posting-engine/i, why: "calls the posting engine" },
];

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, "utf8");
  // strip line comments so a guard-describing comment doesn't trip the guard
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const { re, why } of FORBIDDEN) {
    if (re.test(code)) fail(`${rel}: ${why} — FH-2 must be preview/compute-only (no ledger writes).`);
  }
}

// The gating flag must be registered DEFAULT OFF.
if (fs.existsSync(FH2_MIGRATION)) {
  const mig = fs.readFileSync(FH2_MIGRATION, "utf8");
  if (!/FINANCE_HUB_LOAN_WIZARD_ENABLED/.test(mig) || !/false/.test(mig)) {
    fail("FH-2 migration must register FINANCE_HUB_LOAN_WIZARD_ENABLED with default_enabled=false.");
  }
} else {
  fail("FH-2 flag migration 202606160000_fh2_loan_wizard_flag.sql is missing.");
}

if (failed) process.exit(1);
console.log(`verify-fh2-no-posting: OK — ${files.length} FH-2 files scanned; no ledger writes / posting-engine calls; flag registered default OFF.`);
