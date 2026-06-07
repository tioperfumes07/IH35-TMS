import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL in environment.");
  process.exit(1);
}

const SEARCH_PATH =
  "mdata, dispatch, docs, catalogs, identity, org, integrations, qbo_archive, accounting, banking, factor, documents, pwa, audit, outbox, safety, fuel, driver_finance, maintenance, views, public, email";
const MIGRATIONS_DIR = path.resolve("db/migrations");
const CHECKSUM_OVERRIDES_FILE = path.resolve("scripts/lib/migration-checksum-overrides.json");
// Legacy format: 0001_name.sql, 0001a_name.sql
// New timestamp format: 20260607_120000_name.sql (12-digit prefix)
const MIGRATION_FILE_PATTERN_LEGACY = /^\d{4}[a-z]?_.+\.sql$/i;
const MIGRATION_FILE_PATTERN_TIMESTAMP = /^\d{12}_.+\.sql$/i;
const CANONICAL_LEDGER_TABLE = "_system._schema_migrations";
const MIRROR_LEDGER_TABLE = "ih35_migrations.applied_migrations";
const ARGS = new Set(process.argv.slice(2));
const VERIFY_ONLY = ARGS.has("--verify-only");
const BACKFILL_LEDGER = ARGS.has("--backfill-ledger");

/**
 * Returns true for migration filenames matching either the legacy 4-digit format
 * (e.g. 0001_name.sql, 0001a_name.sql) or the new 12-digit timestamp format
 * (e.g. 20260607_120000_name.sql). Both coexist in the same migrations directory;
 * filenames sort correctly because timestamp names (2026…) sort after all legacy
 * 4-digit names (0001…0999).
 */
function isMigrationFile(name) {
  return MIGRATION_FILE_PATTERN_LEGACY.test(name) || MIGRATION_FILE_PATTERN_TIMESTAMP.test(name);
}

/**
 * Lists migration files, failing LOUDLY on any .sql file whose name matches
 * neither the legacy (^\d{4}[a-z]?_) nor the timestamp (^\d{12}_) pattern.
 *
 * Previously such files (e.g. the YYYYMMDD_HHMMSS format emitted by an old
 * generateMigrationName) were silently filtered out — they would never apply,
 * never ledger, and never error, leaving prod missing grants/tables. We now
 * refuse to proceed so the operator must rename the file before any migration
 * runs. This prevents the entire silent-skip failure class.
 */
function listMigrationFiles() {
  const sqlFiles = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.toLowerCase().endsWith(".sql"));
  const unrecognized = sqlFiles.filter((name) => !isMigrationFile(name));
  if (unrecognized.length > 0) {
    const lines = unrecognized
      .sort()
      .map(
        (filename) =>
          `Migration file ${filename} does not match any recognized naming pattern. Rename to YYYYMMDDHHMM_slug.sql`
      );
    throw new Error(
      `Refusing to run migrations — ${unrecognized.length} unrecognized migration filename(s):\n  ${lines.join("\n  ")}\n` +
        `Recognized patterns: legacy NNNN[a]_slug.sql or timestamp YYYYMMDDHHMM_slug.sql (12 continuous digits).`
    );
  }
  return sqlFiles.filter((name) => isMigrationFile(name)).sort();
}

/**
 * Generates a migration filename using the current UTC timestamp.
 * Format: YYYYMMDDHHMM_<slug>.sql (12 continuous digits, matching
 * MIGRATION_FILE_PATTERN_TIMESTAMP).
 *
 * NOTE: this MUST emit a 12-digit continuous prefix. A prior version emitted
 * YYYYMMDD_HHMMSS (8_6 digits with an internal underscore), which matched
 * neither isMigrationFile() pattern, so the runner silently skipped any file
 * created with it. Keep this aligned with MIGRATION_FILE_PATTERN_TIMESTAMP.
 *
 * Usage: generateMigrationName("add_foo_column")
 *   → "202606071430_add_foo_column.sql"
 */
export function generateMigrationName(slug) {
  if (!slug || typeof slug !== "string") {
    throw new Error("generateMigrationName requires a non-empty slug string");
  }
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hours = pad(now.getUTCHours());
  const minutes = pad(now.getUTCMinutes());
  const sanitized = slug.replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${year}${month}${day}${hours}${minutes}_${sanitized}.sql`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function loadChecksumOverrides() {
  if (!fs.existsSync(CHECKSUM_OVERRIDES_FILE)) return new Map();
  const raw = fs.readFileSync(CHECKSUM_OVERRIDES_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const item of parsed) {
    if (!item?.filename || !item?.ledger_checksum || !item?.disk_checksum) continue;
    map.set(item.filename, item);
  }
  return map;
}

function isChecksumOverrideMatch(overridesByFile, file, ledgerChecksum, diskChecksum) {
  const override = overridesByFile.get(file);
  if (!override) return false;
  return override.ledger_checksum === ledgerChecksum && override.disk_checksum === diskChecksum;
}

async function ensureLedgers(client) {
  await client.query("CREATE SCHEMA IF NOT EXISTS _system;");
  await client.query("CREATE SCHEMA IF NOT EXISTS ih35_migrations;");
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CANONICAL_LEDGER_TABLE} (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text DEFAULT current_user,
      duration_ms integer
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIRROR_LEDGER_TABLE} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getCanonicalLedgerRows(client) {
  const { rows } = await client.query(
    `SELECT filename, checksum, applied_at FROM ${CANONICAL_LEDGER_TABLE} ORDER BY filename ASC;`
  );
  return rows;
}

async function getMirrorLedgerRows(client) {
  const { rows } = await client.query(`SELECT name, applied_at FROM ${MIRROR_LEDGER_TABLE} ORDER BY name ASC;`);
  return rows;
}

async function insertLedgerRow(client, file, checksum, durationMs) {
  await client.query(
    `
      INSERT INTO ${CANONICAL_LEDGER_TABLE} (filename, checksum, duration_ms)
      VALUES ($1, $2, $3)
      ON CONFLICT (filename) DO NOTHING;
    `,
    [file, checksum, durationMs]
  );
  await client.query(
    `
      INSERT INTO ${MIRROR_LEDGER_TABLE} (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING;
    `,
    [file]
  );
}

async function applyMigration(client, file, sql, checksum) {
  const start = Date.now();
  const hasExplicitTx = /\bBEGIN\b/i.test(sql) && /\bCOMMIT\b/i.test(sql);
  await client.query(`SET search_path = ${SEARCH_PATH};`);

  if (hasExplicitTx) {
    await client.query(sql);
    await insertLedgerRow(client, file, checksum, Date.now() - start);
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL search_path = ${SEARCH_PATH};`);
    await client.query(sql);
    await client.query(
      `
        INSERT INTO ${CANONICAL_LEDGER_TABLE} (filename, checksum, duration_ms)
        VALUES ($1, $2, $3);
      `,
      [file, checksum, Date.now() - start]
    );
    await client.query(
      `
        INSERT INTO ${MIRROR_LEDGER_TABLE} (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING;
      `,
      [file]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runVerifyOnly(client, diskMigrations, ledgerByFile, mirrorByFile, overridesByFile) {
  const pending = [];
  const drift = [];
  const appliedButUnlogged = [];

  for (const migration of diskMigrations) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration), "utf8");
    const checksum = sha256(sql);
    const ledger = ledgerByFile.get(migration);

    if (!ledger) {
      pending.push(migration);
      if (mirrorByFile.has(migration)) {
        appliedButUnlogged.push(migration);
      }
      continue;
    }
    if (ledger.checksum !== checksum && !isChecksumOverrideMatch(overridesByFile, migration, ledger.checksum, checksum)) {
      drift.push(`${migration}: checksum mismatch (ledger=${ledger.checksum}, disk=${checksum})`);
    }
  }

  for (const filename of ledgerByFile.keys()) {
    if (!diskMigrations.includes(filename)) {
      drift.push(`${filename}: exists in ledger but missing on disk`);
    }
  }

  console.log(`Applied in ledger: ${ledgerByFile.size}`);
  console.log(`Applied in mirror: ${mirrorByFile.size}`);
  console.log(`Pending on disk: ${pending.length}`);
  console.log(`Applied-but-unlogged (mirror-only): ${appliedButUnlogged.length}`);
  if (pending.length > 0) {
    for (const file of pending) console.log(`  PENDING ${file}`);
  }
  if (appliedButUnlogged.length > 0) {
    for (const file of appliedButUnlogged) console.log(`  UNLOGGED ${file}`);
  }

  if (drift.length > 0) {
    console.error(`Drift detected (${drift.length}):`);
    for (const item of drift) console.error(`  DRIFT ${item}`);
    process.exit(1);
  }

  console.log("No drift detected.");
}

async function runBackfillLedger(client, diskMigrations, ledgerByFile) {
  const toInsert = [];
  if (ledgerByFile.size === 0 && diskMigrations.length > 0) {
    const baseline = diskMigrations.slice(0, -1);
    for (const migration of baseline) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration), "utf8");
      toInsert.push({ migration, checksum: sha256(sql) });
    }
    console.log(
      `Ledger is empty. Backfilling baseline migrations ${baseline[0]}..${baseline[baseline.length - 1]} and leaving latest migration pending: ${diskMigrations[diskMigrations.length - 1]}`
    );
  } else {
    for (const migration of diskMigrations) {
      if (ledgerByFile.has(migration)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration), "utf8");
      toInsert.push({ migration, checksum: sha256(sql) });
    }
  }

  for (const item of toInsert) {
    await insertLedgerRow(client, item.migration, item.checksum, 0);
    console.log(`BACKFILLED ${item.migration}`);
  }
  console.log(`Backfill complete. Inserted ${toInsert.length} ledger row(s).`);
}

const client = new Client(buildPgClientConfig(connectionString));

try {
  await client.connect();
  await ensureLedgers(client);

  const diskMigrations = listMigrationFiles();
  const ledgerRows = await getCanonicalLedgerRows(client);
  const mirrorRows = await getMirrorLedgerRows(client);
  const ledgerByFile = new Map(ledgerRows.map((row) => [row.filename, row]));
  const mirrorByFile = new Map(mirrorRows.map((row) => [row.name, row]));
  const overridesByFile = loadChecksumOverrides();

  if (VERIFY_ONLY) {
    await runVerifyOnly(client, diskMigrations, ledgerByFile, mirrorByFile, overridesByFile);
    process.exit(0);
  }

  if (BACKFILL_LEDGER) {
    await runBackfillLedger(client, diskMigrations, ledgerByFile);
    process.exit(0);
  }

  for (const file of diskMigrations) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = sha256(sql);
    const ledger = ledgerByFile.get(file);

    if (ledger) {
      if (ledger.checksum !== checksum && !isChecksumOverrideMatch(overridesByFile, file, ledger.checksum, checksum)) {
        throw new Error(
          `Migration ${file} was modified after apply (ledger checksum ${ledger.checksum}, disk checksum ${checksum}). Create a follow-up migration instead.`
        );
      }
      if (ledger.checksum !== checksum) {
        console.log(`SKIP ${file} (checksum override accepted)`);
        continue;
      }
      console.log(`SKIP ${file} (already applied)`);
      continue;
    }

    console.log(`APPLY ${file}`);
    await applyMigration(client, file, sql, checksum);
    ledgerByFile.set(file, { filename: file, checksum });
  }

  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
