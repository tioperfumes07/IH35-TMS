#!/usr/bin/env node
/**
 * ACCT-R-02 / 0033-audit-schema-manifest-tool — live schema manifest generator.
 *
 * Pulls the authoritative prod (or branch) schema via pg_catalog + information_schema
 * with SET app.bypass_rls='lucia' so FORCED-RLS tables introspect correctly. Writes
 * docs/schema/SCHEMA-MANIFEST.json — the live-Neon source of truth for schema audits.
 *
 * This is the LIVE complement to the STATIC migration parser
 * (scripts/verify-backend-schema-contract.mjs) and the migration-parsed baseline
 * (docs/schema-parity-baseline.json). Prod wins over migration files (Rule 10).
 *
 * READ-ONLY. Requires an EXPLICIT --database-url (never auto-connects via .env — §1.5).
 *
 *   node scripts/audit-schema.mjs --database-url="postgres://…"
 *   node scripts/audit-schema.mjs --database-url="postgres://…" --out docs/schema/SCHEMA-MANIFEST.json
 *   node scripts/audit-schema.mjs --database-url="postgres://…" --branch br-fancy-credit-akjnd07a
 *
 * Exit 0 = manifest written. Exit 1 = usage/connection error.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "docs/schema/SCHEMA-MANIFEST.json");

const EXCLUDED_SCHEMAS = new Set([
  "pg_catalog",
  "information_schema",
  "pg_toast",
  "pg_temp_1",
  "pg_toast_temp_1",
]);

const KIND_MAP = { r: "table", v: "view", m: "matview", p: "partitioned", f: "foreign" };

function arg(name) {
  const pre = `--${name}=`;
  const eq = process.argv.find((a) => a.startsWith(pre));
  if (eq) return eq.slice(pre.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined;
}

const outPath = arg("out") ? path.resolve(arg("out")) : DEFAULT_OUT;
const branchHint = arg("branch") || "br-fancy-credit-akjnd07a";

/** @param {import('pg').Client} client */
export async function pullLiveSchema(client) {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION READ ONLY");
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

  const who = await client.query(`
    SELECT current_database() AS db,
           COALESCE(host(inet_server_addr())::text, 'local-socket') AS host
  `);

  const relRows = (
    await client.query(`
      SELECT n.nspname AS schema,
             c.relname AS name,
             c.relkind AS kind,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r','v','m','p','f')
         AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
       ORDER BY 1, 2
    `)
  ).rows;

  const colRows = (
    await client.query(`
      SELECT table_schema || '.' || table_name AS rel,
             column_name,
             data_type,
             udt_name,
             is_nullable = 'YES' AS nullable,
             column_default
        FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
       ORDER BY 1, ordinal_position
    `)
  ).rows;

  const fkRows = (
    await client.query(`
      SELECT n.nspname || '.' || c.relname AS rel,
             con.conname AS name,
             a.attname AS column,
             nf.nspname AS ref_schema,
             cf.relname AS ref_table,
             af.attname AS ref_column
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class cf ON cf.oid = con.confrelid
        JOIN pg_namespace nf ON nf.oid = cf.relnamespace
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON ck.ord = fk.ord
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ck.attnum
        JOIN pg_attribute af ON af.attrelid = cf.oid AND af.attnum = fk.attnum
       WHERE con.contype = 'f'
         AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
       ORDER BY 1, 2, ck.ord
    `)
  ).rows;

  await client.query("ROLLBACK");

  const relations = {};
  const schemas = new Set();

  for (const r of relRows) {
    if (EXCLUDED_SCHEMAS.has(r.schema)) continue;
    schemas.add(r.schema);
    const key = `${r.schema}.${r.name}`;
    relations[key] = {
      kind: KIND_MAP[r.kind] || r.kind,
      columns: [],
      rls:
        r.kind === "r" || r.kind === "p"
          ? { enabled: Boolean(r.rls_enabled), forced: Boolean(r.rls_forced) }
          : undefined,
      foreign_keys: [],
    };
  }

  for (const c of colRows) {
    const rel = relations[c.rel];
    if (!rel) continue;
    rel.columns.push({
      name: c.column_name,
      type: c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type,
      nullable: c.nullable,
      default: c.column_default ?? null,
    });
  }

  for (const fk of fkRows) {
    const rel = relations[fk.rel];
    if (!rel) continue;
    rel.foreign_keys.push({
      name: fk.name,
      column: fk.column,
      references: `${fk.ref_schema}.${fk.ref_table}.${fk.ref_column}`,
    });
  }

  const kindCounts = { table: 0, view: 0, matview: 0, partitioned: 0, foreign: 0 };
  let columnCount = 0;
  let fkCount = 0;
  let rlsForced = 0;
  let rlsEnabledNotForced = 0;

  for (const rel of Object.values(relations)) {
    kindCounts[rel.kind] = (kindCounts[rel.kind] || 0) + 1;
    columnCount += rel.columns.length;
    fkCount += rel.foreign_keys.length;
    if (rel.rls?.enabled && rel.rls?.forced) rlsForced += 1;
    else if (rel.rls?.enabled) rlsEnabledNotForced += 1;
  }

  return {
    database: { name: who.rows[0].db, host: who.rows[0].host },
    schemas: [...schemas].sort(),
    relations,
    summary: {
      schema_count: schemas.size,
      relation_count: Object.keys(relations).length,
      ...kindCounts,
      column_count: columnCount,
      fk_count: fkCount,
      rls_forced_table_count: rlsForced,
      rls_enabled_not_forced_table_count: rlsEnabledNotForced,
    },
  };
}

/** Build the committed manifest envelope. */
export function buildManifestEnvelope(pulled, branch) {
  return {
    note:
      "Live schema manifest (pg_catalog + information_schema, SET app.bypass_rls='lucia'). " +
      "Source of truth for prod schema audits — NOT migration-parsed. Regenerate: " +
      "node scripts/audit-schema.mjs --database-url=<read-only-url>",
    branch,
    as_of: new Date().toISOString(),
    source: "pg_catalog + information_schema.columns (bypass_rls=lucia)",
    ...pulled,
  };
}

/** Validate manifest shape (used by verify guard). @returns {string[]} */
export function validateManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object") {
    problems.push("manifest must be an object");
    return problems;
  }
  if (!manifest.source || !/information_schema|pg_catalog/i.test(String(manifest.source))) {
    problems.push("manifest.source must declare pg_catalog/information_schema live introspection");
  }
  if (/Parses all migration|migration-parsed|parseMigrations/i.test(String(manifest.source))) {
    problems.push("manifest.source must NOT be migration-parsed");
  }
  if (!manifest.branch) problems.push("manifest.branch is required");
  if (!manifest.as_of) problems.push("manifest.as_of is required");
  if (!manifest.database?.name) problems.push("manifest.database.name is required");
  if (!manifest.relations || typeof manifest.relations !== "object") {
    problems.push("manifest.relations object is required");
  } else if (Object.keys(manifest.relations).length === 0) {
    problems.push("manifest.relations must be non-empty");
  }
  if (!manifest.summary?.relation_count || manifest.summary.relation_count < 1) {
    problems.push("manifest.summary.relation_count must be >= 1");
  }
  return problems;
}

async function main() {
  const url = arg("database-url");
  if (!url) {
    console.error(
      "usage: audit-schema --database-url=<url> [--out <file>] [--branch <neon-branch-id>]\n" +
        "Refusing to run without an explicit url (no .env auto-connect, §1.5)."
    );
    process.exit(1);
  }

  const client = new pg.Client(buildPgClientConfig(url, { connectionTimeoutMillis: 30000 }));
  await client.connect();
  try {
    const pulled = await pullLiveSchema(client);
    const manifest = buildManifestEnvelope(pulled, branchHint);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `audit-schema: wrote ${path.relative(ROOT, outPath)} — ` +
        `${manifest.summary.relation_count} relations, ${manifest.summary.column_count} columns, ` +
        `${manifest.summary.fk_count} FKs across ${manifest.summary.schema_count} schemas ` +
        `(${manifest.database.name} @ ${manifest.database.host})`
    );
  } finally {
    await client.end().catch(() => {});
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error(`audit-schema FAILED — ${e.message}`);
    process.exit(1);
  });
}
