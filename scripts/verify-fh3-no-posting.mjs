#!/usr/bin/env node
/**
 * FH-3 Amortization boundary guard (Tier-3 integrity).
 * FH-3 persists loans + amortization rows in finance.* (its OWN tables) — that is allowed. It must
 * NOT post to the GL: no accounting.* writes, no posting_batches / journal_entry_postings, no posting
 * engine. Posting the principal/interest split is a LATER gated step behind
 * FINANCE_HUB_AMORTIZATION_POST_ENABLED. This guard FAILS if any FH-3 file crosses that line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FH3_DIR = path.join(ROOT, "apps/backend/src/finance/amortization");
const FH3_MIGRATION = path.join(ROOT, "db/migrations/202606160100_fh3_amortization_data_model.sql");

let failed = 0;
const fail = (m) => { console.error(`verify-fh3-no-posting: ${m}`); failed = 1; };

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

const files = [...walk(FH3_DIR), ...(fs.existsSync(FH3_MIGRATION) ? [FH3_MIGRATION] : [])];
if (files.length === 0) fail("no FH-3 files found (expected apps/backend/src/finance/amortization/*)");

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
  const code = fs.readFileSync(f, "utf8").replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const { re, why } of FORBIDDEN) {
    if (re.test(code)) fail(`${rel}: ${why} — FH-3 must persist to finance.* only, no GL posting.`);
  }
}

if (fs.existsSync(FH3_MIGRATION)) {
  const mig = fs.readFileSync(FH3_MIGRATION, "utf8");
  if (!/FINANCE_HUB_AMORTIZATION_ENABLED/.test(mig) || !/false/.test(mig)) {
    fail("FH-3 migration must register FINANCE_HUB_AMORTIZATION_ENABLED default OFF.");
  }
} else {
  fail("FH-3 migration 202606160100_fh3_amortization_data_model.sql is missing.");
}

if (failed) process.exit(1);
console.log(`verify-fh3-no-posting: OK — ${files.length} FH-3 files scanned; finance.* persistence only, no GL posting; flag OFF.`);
