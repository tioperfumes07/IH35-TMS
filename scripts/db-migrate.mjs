import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";
import {
  validateMigrationFilenames,
  listMigrationFiles,
} from "./lib/migration-filename-validation.mjs";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL in environment.");
  process.exit(1);
}

// ── PROD-MIGRATE SAFETY GUARD (2026-06-28) ───────────────────────────────────
// Why: this repo loads .env via dotenv.config() (above) and resolves
// DATABASE_DIRECT_URL || DATABASE_URL. When .env carries the PROD Neon URL, an
// inline local DATABASE_URL is silently overridden and `db:migrate` connects to
// PROD. This guard makes the target EXPLICIT every run and REFUSES the prod
// endpoint unless ALLOW_PROD_MIGRATE=1 is set on purpose.
function resolveTargetHost(cs) {
  try {
    const u = new URL(cs);
    if (u.hostname) return u.hostname;
  } catch {
    /* not a standard URL — fall through to query-string host */
  }
  const m = /[?&]host=([^&\s]+)/.exec(cs);
  return m ? decodeURIComponent(m[1]) : "";
}
function resolveTargetDb(cs) {
  try {
    const u = new URL(cs);
    const p = (u.pathname || "").replace(/^\//, "");
    if (p) return p;
  } catch {
    /* fall through */
  }
  const m = /\/([^/?]+)(\?|$)/.exec(cs);
  return m ? m[1] : "?";
}
const RESOLVED_HOST = resolveTargetHost(connectionString);
const RESOLVED_DB = resolveTargetDb(connectionString);
// Prod Neon compute endpoint id (pooler + direct share it). Override/extend via
// PROD_MIGRATE_BLOCKLIST (comma-separated host substrings) if the prod endpoint changes.
const PROD_HOST_MARKERS = (process.env.PROD_MIGRATE_BLOCKLIST || "ep-broad-block-akykk7bw")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TARGET_IS_PROD = PROD_HOST_MARKERS.some((m) => RESOLVED_HOST.includes(m));
console.error(
  `[db:migrate] target: host=${RESOLVED_HOST || "(local socket)"} db=${RESOLVED_DB}` +
    (TARGET_IS_PROD ? " [PRODUCTION]" : "")
);
if (TARGET_IS_PROD && process.env.ALLOW_PROD_MIGRATE !== "1") {
  console.error("──────────────────────────────────────────────────────────────");
  console.error("[db:migrate] REFUSED — resolved host matches the PRODUCTION Neon endpoint.");
  console.error(`             host=${RESOLVED_HOST}`);
  console.error("  An inline DATABASE_URL is overridden by .env's DATABASE_DIRECT_URL (dotenv).");
  console.error("  LOCAL migrate:");
  console.error("    DATABASE_DIRECT_URL= DATABASE_URL='postgres://<user>@/<db>?host=/tmp&port=5432&sslmode=disable' npm run db:migrate");
  console.error("  Intentional PROD migrate (ceremony only): set ALLOW_PROD_MIGRATE=1 explicitly.");
  console.error("──────────────────────────────────────────────────────────────");
  process.exit(1);
}
if (TARGET_IS_PROD && process.env.ALLOW_PROD_MIGRATE === "1") {
  console.error("[db:migrate] WARNING: ALLOW_PROD_MIGRATE=1 — proceeding against PRODUCTION.");
}
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_PATH =
  "mdata, dispatch, docs, catalogs, identity, org, integrations, qbo_archive, accounting, banking, factor, documents, pwa, audit, outbox, safety, fuel, driver_finance, maintenance, views, public, email";
const MIGRATIONS_DIR = path.resolve("db/migrations");
const CHECKSUM_OVERRIDES_FILE = path.resolve("scripts/lib/migration-checksum-overrides.json");
const CANONICAL_LEDGER_TABLE = "_system._schema_migrations";
const MIRROR_LEDGER_TABLE = "ih35_migrations.applied_migrations";
const ARGS = new Set(process.argv.slice(2));
const VERIFY_ONLY = ARGS.has("--verify-only");
const BACKFILL_LEDGER = ARGS.has("--backfill-ledger");

/**
 * Wrapper that uses the imported listMigrationFiles with the correct migrations directory.
 * @returns {string[]} Sorted list of migration filenames
 */
function getMigrationFiles() {
  return listMigrationFiles(MIGRATIONS_DIR);
}

/**
 * Wrapper that validates filenames in the configured migrations directory.
 */
function checkMigrationFilenames() {
  validateMigrationFilenames(MIGRATIONS_DIR);
}

/**
 * Generates a migration filename using the current UTC timestamp.
 * Format: YYYYMMDD_HHMMSS_<slug>.sql
 *
 * Usage: generateMigrationName("add_foo_column")
 *   → "20260607_143022_add_foo_column.sql"
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
  const seconds = pad(now.getUTCSeconds());
  const sanitized = slug.replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${sanitized}.sql`;
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
  // Fail fast if any migration files have unrecognized filenames (prevent silent skips)
  checkMigrationFilenames();

  await client.connect();
  await ensureLedgers(client);

  const diskMigrations = getMigrationFiles();
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
