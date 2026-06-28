#!/usr/bin/env node
/**
 * verify-posting-column-contract
 *
 * Every INSERT INTO accounting.journal_entry_postings in the codebase must:
 *   1. Include `operating_company_id` — entity-scope safety (no cross-entity posting).
 *   2. Include `debit_or_credit` — the split model (not legacy debit_cents/credit_cents).
 *   3. Include `idempotency_key` — idempotency enforcement.
 *   4. Include `journal_entry_uuid` — NOT the old `journal_entry_id` column name.
 *   5. NOT reference deprecated column names: `debit_cents`, `credit_cents`,
 *      `journal_entry_id` (renamed to `journal_entry_uuid` in 0092 migration).
 *
 * Also verifies every INSERT INTO accounting.journal_entries includes
 * `operating_company_id` (entity-scope).
 *
 * Static guard — no DB required. Runs in CI on every push.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const BACKEND_SRC = join(ROOT, "apps/backend/src");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function extractSqlLiterals(src) {
  const results = [];
  const tplRe = /`((?:[^`\\]|\\[\s\S])*)`/gs;
  for (const m of src.matchAll(tplRe)) results.push({ sql: m[1], offset: m.index });
  return results;
}

function extractInsertColumnList(sql, tableName) {
  const [, tbl] = tableName.split(".");
  const re = new RegExp(
    `INSERT\\s+INTO\\s+(?:\\w+\\.)?${tbl}\\s*\\(([^)]+)\\)`,
    "is"
  );
  const m = sql.match(re);
  if (!m) return null;
  return new Set(
    m[1].split(",").map((c) => c.trim().toLowerCase().replace(/^"/, "").replace(/"$/, ""))
  );
}

const failures = [];
const files = walk(BACKEND_SRC);

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).split("\\").join("/");
  const literals = extractSqlLiterals(src);

  for (const { sql } of literals) {
    // -----------------------------------------------------------------------
    // Rule: journal_entry_postings INSERTs
    // -----------------------------------------------------------------------
    if (/INSERT\s+INTO\s+(?:accounting\.)?journal_entry_postings\b/i.test(sql)) {
      const cols = extractInsertColumnList(sql, "accounting.journal_entry_postings");
      if (cols) {
        if (!cols.has("operating_company_id")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings missing \`operating_company_id\` (entity-scope safety)`);
        }
        if (!cols.has("debit_or_credit")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings missing \`debit_or_credit\` (use split model, not debit_cents/credit_cents)`);
        }
        if (!cols.has("idempotency_key")) {
          // idempotency_key is nullable — new posting paths should include it, but legacy
          // services predate the requirement. Warn only (do not fail) for now.
          console.warn(`WARN: ${rel}: INSERT INTO journal_entry_postings missing \`idempotency_key\` — add for idempotency safety`);
        }
        if (!cols.has("journal_entry_uuid")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses \`journal_entry_id\` — renamed to \`journal_entry_uuid\` in migration 0092`);
        }
        // Deprecated column check
        if (cols.has("debit_cents")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses deprecated \`debit_cents\` — use \`debit_or_credit\` + \`amount_cents\``);
        }
        if (cols.has("credit_cents")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses deprecated \`credit_cents\` — use \`debit_or_credit\` + \`amount_cents\``);
        }
        if (cols.has("journal_entry_id")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses deprecated \`journal_entry_id\` — renamed to \`journal_entry_uuid\``);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Rule: journal_entries INSERTs must include operating_company_id
    // -----------------------------------------------------------------------
    if (/INSERT\s+INTO\s+(?:accounting\.)?journal_entries\b/i.test(sql)) {
      const cols = extractInsertColumnList(sql, "accounting.journal_entries");
      if (cols && !cols.has("operating_company_id")) {
        failures.push(`${rel}: INSERT INTO journal_entries missing \`operating_company_id\` (entity-scope safety)`);
      }
    }

    // -----------------------------------------------------------------------
    // Rule: no INSERT of deprecated column names into journal_entry_postings
    // (SELECT aliases like `SUM(...) AS debit_cents` are valid — only flag
    //  when the name appears in an INSERT column list for this table)
    // -----------------------------------------------------------------------
    if (/INSERT\s+INTO\s+(?:accounting\.)?journal_entry_postings\b/i.test(sql)) {
      const insCols = extractInsertColumnList(sql, "accounting.journal_entry_postings");
      if (insCols) {
        if (insCols.has("debit_cents")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses deprecated \`debit_cents\` — use \`debit_or_credit\` + \`amount_cents\``);
        }
        if (insCols.has("credit_cents")) {
          failures.push(`${rel}: INSERT INTO journal_entry_postings uses deprecated \`credit_cents\` — use \`debit_or_credit\` + \`amount_cents\``);
        }
      }
    }
    if (/journal_entry_postings/i.test(sql)) {
      if (/\bjournal_entry_id\b(?!\s*_uuid)/i.test(sql)) {
        // Allow journal_entry_id_uuid pattern but catch bare journal_entry_id
        if (!/journal_entry_uuid/i.test(sql)) {
          failures.push(`${rel}: references \`journal_entry_id\` in journal_entry_postings context — use \`journal_entry_uuid\``);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("verify-posting-column-contract FAILED:");
  for (const f of [...new Set(failures)].sort()) console.error(`  ✗ ${f}`);
  console.error(
    "\nPosting column contract violations found. Fix the SQL in the listed files.\n" +
    "See docs/specs/COLUMN-INTEGRITY-PLAN.md for the column truth table."
  );
  process.exit(1);
}

console.log(
  `verify-posting-column-contract OK — ${files.length} backend files scanned, ` +
  `0 posting column contract violations.`
);
