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

function normalizeIdent(raw) {
  return raw.replace(/^"+|"+$/g, "").replace(/"/g, "").trim();
}

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let line = 1;
  let stmtLine = 1;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "\n") line += 1;

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (inDouble) {
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }

    if (ch === "$") {
      const match = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ";") {
      const text = sql.slice(start, i).trim();
      if (text) statements.push({ text, line: stmtLine });
      start = i + 1;
      stmtLine = line;
      i += 1;
      continue;
    }

    i += 1;
  }

  const tail = sql.slice(start).trim();
  if (tail) statements.push({ text: tail, line: stmtLine });
  return statements;
}

function parseQualifiedName(token, defaultSchema) {
  const cleaned = token.trim().replace(/[(),]+$/g, "");
  const parts = cleaned.split(".").map((p) => p.trim()).filter(Boolean);
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

function removeTableOwnedObjects(expectedIndexes, expectedFks, schema, table) {
  for (const [idxKey, idx] of expectedIndexes.entries()) {
    if (idx.tableSchema === schema && idx.table === table) expectedIndexes.delete(idxKey);
  }
  for (const [constraintKey, fk] of expectedFks.entries()) {
    if (fk.tableSchema === schema && fk.table === table) expectedFks.delete(constraintKey);
  }
}

function extractInlineFks(createTableStatement) {
  const matches = [];
  const regex = /constraint\s+("?[\w$]+"?)\s+foreign\s+key/gi;
  let match;
  while ((match = regex.exec(createTableStatement))) {
    matches.push(normalizeIdent(match[1]));
  }
  return matches;
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
    const statements = splitStatements(rawSql);
    let defaultSchema = "public";

    for (const stmt of statements) {
      const normalizedStmt = stmt.text.replace(/\s+/g, " ").trim();
      const lowerStmt = normalizedStmt.toLowerCase();

      const searchPathMatch = normalizedStmt.match(/^set\s+(?:local\s+)?search_path\s+to\s+(.+)$/i);
      if (searchPathMatch) {
        const first = searchPathMatch[1]
          .split(",")
          .map((part) => part.trim())
          .find(Boolean);
        if (first) defaultSchema = normalizeIdent(first);
        continue;
      }

      if (/^do\b/i.test(lowerStmt)) continue;

      const createTableMatch = normalizedStmt.match(
        /^create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s*\(/i
      );
      if (createTableMatch) {
        const { schema, name } = parseQualifiedName(createTableMatch[1], defaultSchema);
        expectedTables.set(tableKey(schema, name), { schema, table: name, file: filename, line: stmt.line });
        for (const constraint of extractInlineFks(normalizedStmt)) {
          expectedFks.set(fkKey(schema, name, constraint), {
            tableSchema: schema,
            table: name,
            constraint,
            file: filename,
            line: stmt.line,
          });
        }
        continue;
      }

      const dropTableMatch = normalizedStmt.match(
        /^drop\s+table\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/i
      );
      if (dropTableMatch) {
        const { schema, name } = parseQualifiedName(dropTableMatch[1], defaultSchema);
        expectedTables.delete(tableKey(schema, name));
        removeTableOwnedObjects(expectedIndexes, expectedFks, schema, name);
        continue;
      }

      const alterTableRenameMatch = normalizedStmt.match(
        /^alter\s+table\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s+rename\s+to\s+("?[\w$]+"?)/i
      );
      if (alterTableRenameMatch) {
        const from = parseQualifiedName(alterTableRenameMatch[1], defaultSchema);
        const toName = normalizeIdent(alterTableRenameMatch[2]);
        const fromKey = tableKey(from.schema, from.name);
        const toKey = tableKey(from.schema, toName);
        const existing = expectedTables.get(fromKey);
        expectedTables.delete(fromKey);
        expectedTables.set(toKey, {
          schema: from.schema,
          table: toName,
          file: existing?.file ?? filename,
          line: existing?.line ?? stmt.line,
        });

        for (const idx of expectedIndexes.values()) {
          if (idx.tableSchema === from.schema && idx.table === from.name) idx.table = toName;
        }
        for (const fk of expectedFks.values()) {
          if (fk.tableSchema === from.schema && fk.table === from.name) fk.table = toName;
        }
        continue;
      }

      const createIndexMatch = normalizedStmt.match(
        /^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s+on\s+((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/i
      );
      if (createIndexMatch) {
        const tableParts = parseQualifiedName(createIndexMatch[2], defaultSchema);
        const indexParts = parseQualifiedName(createIndexMatch[1], tableParts.schema);
        expectedIndexes.set(indexKey(indexParts.schema, indexParts.name), {
          indexSchema: indexParts.schema,
          indexName: indexParts.name,
          tableSchema: tableParts.schema,
          table: tableParts.name,
          file: filename,
          line: stmt.line,
        });
        continue;
      }

      const dropIndexMatch = normalizedStmt.match(
        /^drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)/i
      );
      if (dropIndexMatch) {
        const { schema, name } = parseQualifiedName(dropIndexMatch[1], defaultSchema);
        expectedIndexes.delete(indexKey(schema, name));
        continue;
      }

      const alterIndexRenameMatch = normalizedStmt.match(
        /^alter\s+index\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s+rename\s+to\s+("?[\w$]+"?)/i
      );
      if (alterIndexRenameMatch) {
        const from = parseQualifiedName(alterIndexRenameMatch[1], defaultSchema);
        const toName = normalizeIdent(alterIndexRenameMatch[2]);
        const fromKey = indexKey(from.schema, from.name);
        const existing = expectedIndexes.get(fromKey);
        expectedIndexes.delete(fromKey);
        expectedIndexes.set(indexKey(from.schema, toName), {
          indexSchema: from.schema,
          indexName: toName,
          tableSchema: existing?.tableSchema ?? from.schema,
          table: existing?.table ?? "",
          file: existing?.file ?? filename,
          line: existing?.line ?? stmt.line,
        });
        continue;
      }

      const alterTableForFkMatch = normalizedStmt.match(
        /^alter\s+table\s+(?:if\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?)(?:\.(?:"?[a-zA-Z_][\w$]*"?))?)\s+(.+)/i
      );
      if (alterTableForFkMatch) {
        const tableParts = parseQualifiedName(alterTableForFkMatch[1], defaultSchema);
        const body = alterTableForFkMatch[2];
        const addFkMatch = body.match(/add\s+constraint\s+("?[\w$]+"?)\s+foreign\s+key/i);
        if (addFkMatch) {
          const constraint = normalizeIdent(addFkMatch[1]);
          expectedFks.set(fkKey(tableParts.schema, tableParts.name, constraint), {
            tableSchema: tableParts.schema,
            table: tableParts.name,
            constraint,
            file: filename,
            line: stmt.line,
          });
          continue;
        }

        const dropConstraintMatch = body.match(/drop\s+constraint\s+(?:if\s+exists\s+)?("?[\w$]+"?)/i);
        if (dropConstraintMatch) {
          const constraint = normalizeIdent(dropConstraintMatch[1]);
          expectedFks.delete(fkKey(tableParts.schema, tableParts.name, constraint));
          continue;
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
    if (!actual.tables.has(key)) missing.push({ kind: "table", key, file: item.file, line: item.line });
  }
  for (const item of expected.indexes) {
    const key = indexKey(item.indexSchema, item.indexName);
    if (!actual.indexes.has(key)) missing.push({ kind: "index", key, file: item.file, line: item.line });
  }
  for (const item of expected.fks) {
    const key = fkKey(item.tableSchema, item.table, item.constraint);
    if (!actual.fks.has(key)) missing.push({ kind: "foreign_key", key, file: item.file, line: item.line });
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
      console.error(` - ${item.kind} missing: ${item.key} (declared in ${item.file}:${item.line ?? "?"})`);
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
