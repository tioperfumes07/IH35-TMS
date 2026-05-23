#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(".");
const DEFAULT_MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const MIGRATION_FILENAME_REGEX = /^\d{4}[a-z]?_.+\.sql$/i;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function stripComments(sql) {
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlock
    .split("\n")
    .map((line) => line.replace(/--.*$/g, " "))
    .join("\n");
}

function stripDollarQuotedBodies(sql) {
  return sql.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ");
}

function maskLiteralBodies(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, " '' ");
}

function normalizeIdent(raw) {
  return raw.replace(/"/g, "").trim();
}

function parseDefaultSchema(sqlText) {
  const regex = /set\s+(?:local\s+)?search_path\s+to\s+([^;]+)/gi;
  let match;
  while ((match = regex.exec(sqlText))) {
    const first = match[1]
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (first) return normalizeIdent(first);
  }
  return "public";
}

function parseQualifiedName(token, defaultSchema) {
  const cleaned = token.trim();
  const parts = cleaned.split(".");
  if (parts.length === 2) {
    return { schema: normalizeIdent(parts[0]), name: normalizeIdent(parts[1]) };
  }
  return { schema: defaultSchema, name: normalizeIdent(parts[0]) };
}

function tableKey(schema, table) {
  return `${schema}.${table}`;
}

function indexKey(schema, indexName) {
  return `${schema}.${indexName}`;
}

function fkKey(schema, table, constraint) {
  return `${schema}.${table}.${constraint}`;
}

function collectExpectedObjects(migrationsDirectory) {
  const files = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => MIGRATION_FILENAME_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b));

  const expectedTables = new Map();
  const expectedIndexes = new Map();
  const expectedFks = new Map();

  for (const filename of files) {
    const fullPath = path.join(migrationsDirectory, filename);
    const rawSql = fs.readFileSync(fullPath, "utf8");
    const sql = maskLiteralBodies(stripComments(stripDollarQuotedBodies(rawSql)));
    const defaultSchema = parseDefaultSchema(sql);

    {
      const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/gi;
      let match;
      while ((match = regex.exec(sql))) {
        const { schema, name } = parseQualifiedName(match[1], defaultSchema);
        expectedTables.set(tableKey(schema, name), { schema, table: name, file: filename });
      }
    }

    {
      const regex = /drop\s+table\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/gi;
      let match;
      while ((match = regex.exec(sql))) {
        const { schema, name } = parseQualifiedName(match[1], defaultSchema);
        const key = tableKey(schema, name);
        expectedTables.delete(key);
        for (const [idxKey, idx] of expectedIndexes.entries()) {
          if (idx.tableSchema === schema && idx.table === name) expectedIndexes.delete(idxKey);
        }
        for (const [constraintKey, fk] of expectedFks.entries()) {
          if (fk.tableSchema === schema && fk.table === name) expectedFks.delete(constraintKey);
        }
      }
    }

    {
      const regex =
        /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s+on\s+((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/gi;
      let match;
      while ((match = regex.exec(sql))) {
        const tableParts = parseQualifiedName(match[2], defaultSchema);
        const indexParts = parseQualifiedName(match[1], tableParts.schema);
        expectedIndexes.set(indexKey(indexParts.schema, indexParts.name), {
          indexSchema: indexParts.schema,
          indexName: indexParts.name,
          tableSchema: tableParts.schema,
          table: tableParts.name,
          file: filename,
        });
      }
    }

    {
      const regex = /drop\s+index\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/gi;
      let match;
      while ((match = regex.exec(sql))) {
        const { schema, name } = parseQualifiedName(match[1], defaultSchema);
        expectedIndexes.delete(indexKey(schema, name));
      }
    }

    {
      const alterRegex =
        /alter\s+table\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)([\s\S]*?);/gi;
      let alterMatch;
      while ((alterMatch = alterRegex.exec(sql))) {
        const tableParts = parseQualifiedName(alterMatch[1], defaultSchema);
        const body = alterMatch[2];

        const addFkRegex = /add\s+constraint\s+("?[\w$]+"?)\s+foreign\s+key/gi;
        let addMatch;
        while ((addMatch = addFkRegex.exec(body))) {
          const constraint = normalizeIdent(addMatch[1]);
          expectedFks.set(fkKey(tableParts.schema, tableParts.name, constraint), {
            tableSchema: tableParts.schema,
            table: tableParts.name,
            constraint,
            file: filename,
          });
        }

        const dropConstraintRegex = /drop\s+constraint\s+(?:if\s+exists\s+)?("?[\w$]+"?)/gi;
        let dropMatch;
        while ((dropMatch = dropConstraintRegex.exec(body))) {
          const constraint = normalizeIdent(dropMatch[1]);
          expectedFks.delete(fkKey(tableParts.schema, tableParts.name, constraint));
        }
      }
    }

    {
      const createTableWithBodyRegex =
        /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s*\(([\s\S]*?)\)\s*;/gi;
      let tableMatch;
      while ((tableMatch = createTableWithBodyRegex.exec(sql))) {
        const tableParts = parseQualifiedName(tableMatch[1], defaultSchema);
        const body = tableMatch[2];
        const fkConstraintRegex = /constraint\s+("?[\w$]+"?)\s+foreign\s+key/gi;
        let fkMatch;
        while ((fkMatch = fkConstraintRegex.exec(body))) {
          const constraint = normalizeIdent(fkMatch[1]);
          expectedFks.set(fkKey(tableParts.schema, tableParts.name, constraint), {
            tableSchema: tableParts.schema,
            table: tableParts.name,
            constraint,
            file: filename,
          });
        }
      }
    }
  }

  return {
    filesScanned: files.length,
    tables: [...expectedTables.values()],
    indexes: [...expectedIndexes.values()],
    fks: [...expectedFks.values()],
  };
}

async function readActualStateFromDb(connectionString) {
  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    const tableRes = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
    `);
    const indexRes = await client.query(`
      SELECT schemaname, indexname
      FROM pg_indexes
    `);
    const fkRes = await client.query(`
      SELECT ns.nspname AS table_schema, cls.relname AS table_name, con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE con.contype = 'f'
    `);
    return {
      tables: new Set(tableRes.rows.map((r) => tableKey(r.table_schema, r.table_name))),
      indexes: new Set(indexRes.rows.map((r) => indexKey(r.schemaname, r.indexname))),
      fks: new Set(fkRes.rows.map((r) => fkKey(r.table_schema, r.table_name, r.constraint_name))),
    };
  } finally {
    await client.end();
  }
}

function readActualStateFromFile(stateFilePath) {
  const parsed = JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
  return {
    tables: new Set(parsed.tables ?? []),
    indexes: new Set(parsed.indexes ?? []),
    fks: new Set(parsed.fks ?? []),
  };
}

function verifyConsistency(expected, actual) {
  const missing = [];

  for (const item of expected.tables) {
    const key = tableKey(item.schema, item.table);
    if (!actual.tables.has(key)) missing.push({ kind: "table", key, file: item.file });
  }
  for (const item of expected.indexes) {
    const key = indexKey(item.indexSchema, item.indexName);
    if (!actual.indexes.has(key)) missing.push({ kind: "index", key, file: item.file });
  }
  for (const item of expected.fks) {
    const key = fkKey(item.tableSchema, item.table, item.constraint);
    if (!actual.fks.has(key)) missing.push({ kind: "foreign_key", key, file: item.file });
  }

  return missing;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const migrationsDir = path.resolve(args["migrations-dir"] || DEFAULT_MIGRATIONS_DIR);
  const stateFile = args["state-file"] ? path.resolve(args["state-file"]) : null;
  const connectionString = args["database-url"] || process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

  const expected = collectExpectedObjects(migrationsDir);
  const actual = stateFile ? readActualStateFromFile(stateFile) : await readActualStateFromDb(connectionString);
  const missing = verifyConsistency(expected, actual);

  if (missing.length > 0) {
    console.error("verify:migration-application-consistency FAILED");
    for (const item of missing) {
      console.error(` - ${item.kind} missing: ${item.key} (declared in ${item.file})`);
    }
    process.exit(1);
  }

  console.log(
    `verify:migration-application-consistency OK — files=${expected.filesScanned} tables=${expected.tables.length} indexes=${expected.indexes.length} foreign_keys=${expected.fks.length}`
  );
}

main().catch((error) => {
  console.error(`verify:migration-application-consistency FAILED: ${String(error?.message ?? error)}`);
  process.exit(1);
});
