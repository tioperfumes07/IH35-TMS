#!/usr/bin/env node
// INV-2 CI guard — no hard DELETE on accounting financial line/application tables.
//
// Invariant (CLAUDE.md §2, Ch.11): accounting.invoice_lines, accounting.payment_applications,
// and accounting.banking_rules must never be physically deleted.
// Use soft_deleted_at / unapplied_at / is_active=false instead.
//
// Run: node scripts/verify-inv2-no-hard-delete-accounting.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`FAIL verify-inv2-no-hard-delete-accounting: ${msg}`); process.exit(1); };

const FORBIDDEN_PATTERNS = [
  { pattern: /DELETE\s+FROM\s+accounting\.invoice_lines/i,          table: "accounting.invoice_lines" },
  { pattern: /DELETE\s+FROM\s+accounting\.payment_applications/i,    table: "accounting.payment_applications" },
  { pattern: /DELETE\s+FROM\s+accounting\.banking_rules/i,           table: "accounting.banking_rules" },
];

function walkDir(dir, exts, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkDir(fp, exts, results);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      results.push(fp);
    }
  }
  return results;
}

// Scan only TypeScript runtime files — SQL migrations may reference these table names
// in comments documenting the fix and are not runtime DELETE callers.
const allFiles = walkDir(join(root, "apps/backend/src"), [".ts"]);

const offenders = [];
for (const fp of allFiles) {
  const src = readFileSync(fp, "utf8");
  for (const { pattern, table } of FORBIDDEN_PATTERNS) {
    if (pattern.test(src)) {
      offenders.push({ file: fp.replace(root + "/", ""), table });
    }
  }
}

if (offenders.length > 0) {
  console.error("FAIL verify-inv2-no-hard-delete-accounting: hard DELETE on protected tables found:");
  for (const o of offenders) console.error(`  - ${o.file}  [${o.table}]`);
  fail("Use soft_deleted_at / unapplied_at / is_active=false (void-never-delete invariant, CLAUDE.md §2)");
}

console.log("PASS verify-inv2-no-hard-delete-accounting: no hard DELETE on protected accounting tables");
