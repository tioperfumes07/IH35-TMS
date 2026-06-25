#!/usr/bin/env node
/**
 * Regenerate scripts/canonical-relations.json — the canonical set of real prod relations the
 * phantom-relation CI guard (scripts/verify-phantom-relations.mjs) validates backend SQL against.
 *
 * Prod DB access is GATED (CLAUDE.md §1.5). Run this ONLY with an explicit, per-use READ-ONLY
 * connection string (e.g. a Neon branch or prod read-replica), never a committed/cached URL:
 *
 *   DATABASE_URL="<read-only conn>" node scripts/gen-canonical-relations.mjs
 *
 * It opens a READ ONLY transaction and only SELECTs from pg_catalog. CI never runs this — CI reads
 * the committed JSON snapshot. Regenerate + commit after any migration that adds/renames a relation.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "canonical-relations.json");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required (read-only connection string).");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("SET TRANSACTION READ ONLY");
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','v','m','p','f')               -- table, view, matview, partitioned, foreign
      AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
    ORDER BY 1, 2
  `);
  await client.end();

  const relations = rows.map((r) => `${r.schema}.${r.name}`);
  const schemas = new Set(rows.map((r) => r.schema)).size;
  const payload = {
    generated_note:
      "Prod relation snapshot (read-only) — canonical set for the phantom-relation CI guard. " +
      "Regenerate via scripts/gen-canonical-relations.mjs after schema changes. GATED prod access (CLAUDE.md §1.5).",
    count: relations.length,
    relations,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${OUT} — ${relations.length} relations across ${schemas} schemas`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
