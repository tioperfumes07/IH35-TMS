#!/usr/bin/env node
/**
 * FH-4 Finance Calculator boundary guard (Tier-3 integrity).
 * FH-4 is PURE modeling — it writes NOTHING and never posts. This guard FAILS if any FH-4 file
 * references posting_batches / journal_entry_postings, writes into accounting.* or finance.*
 * (INSERT/UPDATE/DELETE), or calls the posting engine. Keeps the calculator a pure, safe surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "apps/backend/src/finance/calculator");
const MIGRATION = path.join(ROOT, "db/migrations/202606160200_fh4_calculator_flag.sql");

let failed = 0;
const fail = (m) => { console.error(`verify-fh4-no-posting: ${m}`); failed = 1; };

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

const files = [...walk(DIR), ...(fs.existsSync(MIGRATION) ? [MIGRATION] : [])];
if (files.length === 0) fail("no FH-4 files found (expected apps/backend/src/finance/calculator/*)");

const FORBIDDEN = [
  { re: /posting_batches/i, why: "references accounting.posting_batches" },
  { re: /journal_entry_postings/i, why: "references accounting.journal_entry_postings" },
  { re: /\bINSERT\s+INTO\s+(accounting|finance)\./i, why: "writes (INSERT) into accounting/finance.*" },
  { re: /\bUPDATE\s+(accounting|finance)\./i, why: "writes (UPDATE) into accounting/finance.*" },
  { re: /\bDELETE\s+FROM\s+(accounting|finance)\./i, why: "writes (DELETE) into accounting/finance.*" },
  { re: /postSourceTransaction|reversePostedSourceTransaction|posting-engine/i, why: "calls the posting engine" },
];

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const code = fs.readFileSync(f, "utf8").replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const { re, why } of FORBIDDEN) {
    if (re.test(code)) fail(`${rel}: ${why} — FH-4 must be pure compute (no writes, no posting).`);
  }
}

if (fs.existsSync(MIGRATION)) {
  const mig = fs.readFileSync(MIGRATION, "utf8");
  if (!/FINANCE_HUB_CALCULATOR_ENABLED/.test(mig) || !/false/.test(mig)) {
    fail("FH-4 migration must register FINANCE_HUB_CALCULATOR_ENABLED default OFF.");
  }
} else {
  fail("FH-4 migration 202606160200_fh4_calculator_flag.sql is missing.");
}

if (failed) process.exit(1);
console.log(`verify-fh4-no-posting: OK — ${files.length} FH-4 files scanned; pure compute, no writes/posting; flag OFF.`);
