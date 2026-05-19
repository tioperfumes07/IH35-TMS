#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

function assertNotMatches(source, regex, message) {
  if (regex.test(source)) throw new Error(message);
}

try {
  const migrationPath = "db/migrations/0195_accounting_posting_backbone_schema.sql";
  const migration = read(migrationPath);
  const migrationsDir = fs.readdirSync("db/migrations");

  for (const file of migrationsDir) {
    if (!file.endsWith(".sql")) continue;
    const sql = read(`db/migrations/${file}`);
    assertNotMatches(
      sql,
      /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?accounting\.journal_entry_lines\b/i,
      `journal_entry_lines table/view exists in ${file}`,
    );
  }

  assertIncludes(
    migration,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_jep_source_posting_batch",
    "Idempotency unique index on journal_entry_postings is missing",
  );

  for (const table of ["posting_batches", "transaction_source_links"]) {
    assertMatches(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS accounting\\.${table}[\\s\\S]*?operating_company_id uuid NOT NULL`, "i"),
      `${table} missing operating_company_id column`,
    );
    assertMatches(
      migration,
      new RegExp(`ALTER TABLE accounting\\.${table} ENABLE ROW LEVEL SECURITY;`, "i"),
      `${table} missing RLS enable statement`,
    );
    assertMatches(
      migration,
      new RegExp(
        `CREATE POLICY ${table}_company_scope[\\s\\S]*?operating_company_id::text = current_setting\\('app\\.operating_company_id', true\\)[\\s\\S]*?current_setting\\('app\\.bypass_rls', true\\) = 'lucia'`,
        "i",
      ),
      `${table} missing required operating_company_id RLS policy pattern`,
    );
  }

  const transactionSourceLinksTableMatch = migration.match(
    /CREATE TABLE IF NOT EXISTS accounting\.transaction_source_links\s*\(([\s\S]*?)\);/i,
  );
  if (!transactionSourceLinksTableMatch) {
    throw new Error("transaction_source_links table definition missing");
  }
  assertNotMatches(
    transactionSourceLinksTableMatch[1],
    /\bidempotency_key\b/i,
    "transaction_source_links must not include idempotency_key",
  );

  console.log("✅ Accounting backbone schema guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
