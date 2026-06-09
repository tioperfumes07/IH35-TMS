#!/usr/bin/env node
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("db:verify:rls-cross-tenant-gate FAIL: DATABASE_DIRECT_URL or DATABASE_URL required");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const runSuffix = crypto.randomUUID().slice(0, 8);

function qid(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function fqtn(schemaName, tableName) {
  return `${qid(schemaName)}.${qid(tableName)}`;
}

async function inTx(client, fn) {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function withBypassFixtureContext(client, fn) {
  return inTx(client, async () => {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SET LOCAL session_replication_role = replica");
    return fn();
  });
}

async function withTenantReadContext(client, companyId, fn) {
  return inTx(client, async () => {
    await client.query("SET LOCAL ROLE ih35_app");
    await client.query("SELECT set_config('app.bypass_rls', '', true)");
    if (companyId) {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    } else {
      await client.query("SELECT set_config('app.operating_company_id', '', true)");
    }
    return fn();
  });
}

function parseAllowedLiteral(checkDef, columnName) {
  const columnRef = new RegExp(`\\b${columnName}\\b`, "i");
  if (!columnRef.test(checkDef)) return null;
  if (/[~]/.test(checkDef) || /\bSIMILAR TO\b/i.test(checkDef) || /\bLIKE\b/i.test(checkDef)) return null;
  const literals = [...checkDef.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (literals.length === 0) return null;
  return literals[0];
}

function parseRegexLiteral(checkDef, columnName) {
  const columnRef = new RegExp(`\\b${columnName}\\b`, "i");
  if (!columnRef.test(checkDef)) return null;
  if (!/[~]/.test(checkDef)) return null;
  const literals = [...checkDef.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return literals.find((value) => value.includes("^") || value.includes("[0-9]")) ?? null;
}

function tableAcronym(tableName) {
  const letters = String(tableName)
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "ID";
}

function numericToken(seed, digits) {
  const digest = crypto.createHash("sha1").update(seed).digest("hex");
  const raw = Number.parseInt(digest.slice(0, 12), 16);
  const width = Math.max(1, Math.min(digits, 12));
  const mod = 10 ** width;
  return String(raw % mod).padStart(width, "0");
}

function buildDisplayId(tableName, marker, prefix, digits) {
  const code = (prefix || tableAcronym(tableName)).slice(0, 8).toUpperCase();
  return `${code}-${numericToken(`${tableName}:${marker}`, digits)}`;
}

function valueFromRegex(regexLiteral, tableName, marker) {
  if (!regexLiteral) return null;
  // Two-segment pattern: ^PREFIX-[0-9]{N}-[0-9]{M}$  (e.g. ^CM-[0-9]{4}-[0-9]{4}$)
  const twoGroupPattern =
    regexLiteral.match(/^\^([A-Za-z]{1,8})-\[0-9\]\{(\d+)\}-\[0-9\]\{(\d+)\}\$$/) ??
    regexLiteral.match(/^\^([A-Za-z]{1,8})-\\d\{(\d+)\}-\\d\{(\d+)\}\$$/);
  if (twoGroupPattern) {
    const prefix = twoGroupPattern[1];
    const d1 = Number(twoGroupPattern[2]);
    const d2 = Number(twoGroupPattern[3]);
    return `${prefix}-${numericToken(`${tableName}:${marker}:g1`, d1)}-${numericToken(`${tableName}:${marker}:g2`, d2)}`;
  }
  // Single-segment pattern: ^PREFIX-[0-9]{N}$
  const explicitPrefixDigits =
    regexLiteral.match(/^\^([A-Za-z]{1,8})-\[0-9\]\{(\d+)\}\$$/) ??
    regexLiteral.match(/^\^([A-Za-z]{1,8})-\\d\{(\d+)\}\$$/);
  if (explicitPrefixDigits) {
    return buildDisplayId(tableName, marker, explicitPrefixDigits[1], Number(explicitPrefixDigits[2]));
  }
  const simplePrefix = regexLiteral.match(/^\^([A-Za-z]{1,8})-/);
  if (simplePrefix) {
    return buildDisplayId(tableName, marker, simplePrefix[1], 6);
  }
  return null;
}

async function getFirstEnumLabel(client, typeOid, enumCache) {
  const cached = enumCache.get(typeOid);
  if (cached !== undefined) return cached;
  const res = await client.query(
    `
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = $1
      ORDER BY enumsortorder
      LIMIT 1
    `,
    [typeOid]
  );
  const value = res.rows[0]?.enumlabel ?? null;
  enumCache.set(typeOid, value);
  return value;
}

function scalarFallbackForType(typeName, columnName, marker) {
  const lower = String(typeName || "").toLowerCase();
  if (lower === "uuid") return crypto.randomUUID();
  if (["text", "varchar", "bpchar", "citext", "name"].includes(lower)) return `${columnName}_${marker}`;
  if (["int2", "int4", "int8", "smallint", "integer", "bigint"].includes(lower)) return 1;
  if (["numeric", "decimal", "float4", "float8", "real", "double precision"].includes(lower)) return 1;
  if (["bool", "boolean"].includes(lower)) return true;
  if (lower === "date") return "2026-01-01";
  if (["timestamp", "timestamptz", "timestamp without time zone", "timestamp with time zone"].includes(lower)) {
    return new Date().toISOString();
  }
  if (["time", "timetz", "time without time zone", "time with time zone"].includes(lower)) return "00:00:00";
  if (lower === "interval") return "1 second";
  if (lower === "json" || lower === "jsonb") return {};
  if (lower === "bytea") return Buffer.from("01", "hex");
  if (["inet", "cidr"].includes(lower)) return "127.0.0.1";
  if (lower === "macaddr" || lower === "macaddr8") return "08:00:2b:01:02:03";
  if (lower.endsWith("[]")) return [];
  return undefined;
}

async function buildValue(client, table, column, marker, checks, enumCache) {
  const regexLiteral = checks.map((check) => parseRegexLiteral(check, column.column_name)).find(Boolean);
  const regexValue = valueFromRegex(regexLiteral, table.table_name, marker);
  if (regexValue !== null) return regexValue;

  const checkLiteral = checks.map((check) => parseAllowedLiteral(check, column.column_name)).find(Boolean);
  if (checkLiteral) return checkLiteral;

  if (column.column_name === "display_id") {
    return buildDisplayId(table.table_name, marker, null, 6);
  }

  // Special handling for payment_applications: populate invoice_id when target_kind is 'invoice'
  // This satisfies the check constraint: (target_kind = 'invoice' AND invoice_id IS NOT NULL) OR (target_kind <> 'invoice')
  if (table.table_name === "payment_applications" && column.column_name === "invoice_id") {
    return crypto.randomUUID();
  }

  if (column.typtype === "e") {
    const enumLabel = await getFirstEnumLabel(client, column.type_oid, enumCache);
    if (enumLabel !== null) return enumLabel;
  }

  const effectiveType = column.typtype === "d" ? column.base_typname || column.typname : column.typname;
  return scalarFallbackForType(effectiveType, column.column_name, marker);
}

async function tableColumns(client, relationOid) {
  const res = await client.query(
    `
      SELECT
        a.attname AS column_name,
        a.attnotnull AS is_not_null,
        a.attidentity AS identity_kind,
        a.attgenerated AS generated_kind,
        a.atttypid AS type_oid,
        t.typname,
        t.typtype,
        bt.typname AS base_typname,
        pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE a.attrelid = $1::oid
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum
    `,
    [relationOid]
  );
  return res.rows;
}

async function tableCheckConstraints(client, relationOid) {
  const res = await client.query(
    `
      SELECT pg_get_constraintdef(c.oid) AS check_def
      FROM pg_constraint c
      WHERE c.conrelid = $1::oid
        AND c.contype = 'c'
    `,
    [relationOid]
  );
  return res.rows.map((row) => String(row.check_def));
}

async function insertFixtureForCompany(client, table, companyId, marker, enumCache) {
  const columns = await tableColumns(client, table.relation_oid);
  const checks = await tableCheckConstraints(client, table.relation_oid);
  const insertCols = [];
  const values = [];

  for (const column of columns) {
    if (column.generated_kind && column.generated_kind !== "") continue;
    if (column.identity_kind && column.identity_kind !== "") continue;

    if (column.column_name === "operating_company_id") {
      insertCols.push(column.column_name);
      values.push(companyId);
      continue;
    }

    const hasDefault = column.default_expr !== null;
    if (!column.is_not_null || hasDefault) continue;

    const value = await buildValue(client, table, column, marker, checks, enumCache);
    if (value === undefined) {
      throw new Error(`cannot synthesize required column ${table.full_name}.${column.column_name}`);
    }

    insertCols.push(column.column_name);
    values.push(value);
  }

  if (!insertCols.includes("operating_company_id")) {
    throw new Error(`table ${table.full_name} missing operating_company_id insert mapping`);
  }

  const placeholderList = insertCols.map((_, idx) => `$${idx + 1}`).join(", ");
  const sql = `INSERT INTO ${fqtn(table.schema_name, table.table_name)} (${insertCols.map(qid).join(", ")}) VALUES (${placeholderList})`;
  await client.query(sql, values);
}

async function countRowsForCompany(client, table, companyId) {
  const res = await client.query(
    `SELECT count(*)::int AS c FROM ${fqtn(table.schema_name, table.table_name)} WHERE operating_company_id::text = $1`,
    [companyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function createFixtureCompanies(client) {
  return withBypassFixtureContext(client, async () => {
    const companyA = await client.query(
      `
        INSERT INTO org.companies (code, legal_name, short_name, company_type, is_active)
        VALUES ($1, $2, $3, 'operating_carrier', true)
        RETURNING id::text AS id
      `,
      [`RLSA${runSuffix.toUpperCase()}`, `RLS Company A ${runSuffix}`, `RLS-A-${runSuffix}`]
    );
    const companyB = await client.query(
      `
        INSERT INTO org.companies (code, legal_name, short_name, company_type, is_active)
        VALUES ($1, $2, $3, 'operating_carrier', true)
        RETURNING id::text AS id
      `,
      [`RLSB${runSuffix.toUpperCase()}`, `RLS Company B ${runSuffix}`, `RLS-B-${runSuffix}`]
    );
    return {
      companyAId: String(companyA.rows[0]?.id),
      companyBId: String(companyB.rows[0]?.id),
    };
  });
}

async function discoverProtectedTables(client) {
  const res = await client.query(
    `
      SELECT
        c.oid AS relation_oid,
        n.nspname AS schema_name,
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        EXISTS (
          SELECT 1
          FROM pg_policy p
          WHERE p.polrelid = c.oid
        ) AS has_policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind = 'r'
        AND a.attname = 'operating_company_id'
        AND NOT a.attisdropped
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      GROUP BY c.oid, n.nspname, c.relname, c.relrowsecurity
      ORDER BY n.nspname, c.relname
    `
  );

  const tables = res.rows.map((row) => ({
    relation_oid: Number(row.relation_oid),
    schema_name: String(row.schema_name),
    table_name: String(row.table_name),
    full_name: `${row.schema_name}.${row.table_name}`,
    rls_enabled: Boolean(row.rls_enabled),
    has_policy: Boolean(row.has_policy),
  }));

  for (const table of tables) {
    if (!table.rls_enabled || !table.has_policy) {
      throw new Error(`RLS missing for table ${table.full_name}`);
    }
  }

  return tables;
}

async function cleanupFixtureRows(client, tables, companyAId, companyBId) {
  await withBypassFixtureContext(client, async () => {
    const reverseTables = [...tables].reverse();
    for (const table of reverseTables) {
      await client.query(
        `DELETE FROM ${fqtn(table.schema_name, table.table_name)} WHERE operating_company_id::text = $1 OR operating_company_id::text = $2`,
        [companyAId, companyBId]
      );
    }
    await client.query(`DELETE FROM org.companies WHERE id = $1::uuid OR id = $2::uuid`, [companyAId, companyBId]);
  });
}

const client = await pool.connect();
let companies = null;
let tables = [];

try {
  tables = await discoverProtectedTables(client);
  if (tables.length === 0) {
    throw new Error("no operating_company_id tables discovered");
  }

  companies = await createFixtureCompanies(client);
  const enumCache = new Map();

  for (const table of tables) {
    await withBypassFixtureContext(client, async () => {
      await insertFixtureForCompany(client, table, companies.companyAId, `A_${runSuffix}`, enumCache);
      await insertFixtureForCompany(client, table, companies.companyBId, `B_${runSuffix}`, enumCache);
    });
  }

  for (const table of tables) {
    const asA = await withTenantReadContext(client, companies.companyAId, async () => {
      const countA = await countRowsForCompany(client, table, companies.companyAId);
      const countB = await countRowsForCompany(client, table, companies.companyBId);
      return { countA, countB };
    });
    if (asA.countA !== 1 || asA.countB !== 0) {
      throw new Error(`${table.full_name} failed A scope check (A=${asA.countA}, B=${asA.countB})`);
    }

    const asB = await withTenantReadContext(client, companies.companyBId, async () => {
      const countA = await countRowsForCompany(client, table, companies.companyAId);
      const countB = await countRowsForCompany(client, table, companies.companyBId);
      return { countA, countB };
    });
    if (asB.countA !== 0 || asB.countB !== 1) {
      throw new Error(`${table.full_name} failed B scope check (A=${asB.countA}, B=${asB.countB})`);
    }

    const denyByDefault = await withTenantReadContext(client, null, async () => {
      const countA = await countRowsForCompany(client, table, companies.companyAId);
      const countB = await countRowsForCompany(client, table, companies.companyBId);
      return { countA, countB };
    });
    if (denyByDefault.countA !== 0 || denyByDefault.countB !== 0) {
      throw new Error(
        `${table.full_name} failed default-deny check (empty GUC saw A=${denyByDefault.countA}, B=${denyByDefault.countB})`
      );
    }
  }

  console.log(`db:verify:rls-cross-tenant-gate PASS (${tables.length} tables validated)`);
} catch (error) {
  console.error(`db:verify:rls-cross-tenant-gate FAIL: ${String(error?.message || error)}`);
  process.exitCode = 1;
} finally {
  if (companies) {
    try {
      await cleanupFixtureRows(client, tables, companies.companyAId, companies.companyBId);
    } catch (cleanupError) {
      console.error(`db:verify:rls-cross-tenant-gate FAIL: cleanup error -> ${String(cleanupError?.message || cleanupError)}`);
      process.exitCode = 1;
    }
  }
  client.release();
  await pool.end();
}
