import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

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
const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;
const ARGS = new Set(process.argv.slice(2));
const VERIFY_ONLY = ARGS.has("--verify-only");
const BACKFILL_LEDGER = ARGS.has("--backfill-ledger");

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort();
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

async function ensureLedger(client) {
  await client.query("CREATE SCHEMA IF NOT EXISTS _system;");
  await client.query(`
    CREATE TABLE IF NOT EXISTS _system._schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text DEFAULT current_user,
      duration_ms integer
    );
  `);
}

async function getLedgerRows(client) {
  const { rows } = await client.query(
    "SELECT filename, checksum, applied_at FROM _system._schema_migrations ORDER BY filename ASC;"
  );
  return rows;
}

async function insertLedgerRow(client, file, checksum, durationMs) {
  await client.query(
    `
      INSERT INTO _system._schema_migrations (filename, checksum, duration_ms)
      VALUES ($1, $2, $3)
      ON CONFLICT (filename) DO NOTHING;
    `,
    [file, checksum, durationMs]
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
        INSERT INTO _system._schema_migrations (filename, checksum, duration_ms)
        VALUES ($1, $2, $3);
      `,
      [file, checksum, Date.now() - start]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runVerifyOnly(client, diskMigrations, ledgerByFile, overridesByFile) {
  const pending = [];
  const drift = [];

  for (const migration of diskMigrations) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration), "utf8");
    const checksum = sha256(sql);
    const ledger = ledgerByFile.get(migration);

    if (!ledger) {
      pending.push(migration);
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
  console.log(`Pending on disk: ${pending.length}`);
  if (pending.length > 0) {
    for (const file of pending) console.log(`  PENDING ${file}`);
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

const client = new Client({ connectionString });

try {
  await client.connect();
  await ensureLedger(client);

  const diskMigrations = listMigrationFiles();
  const ledgerRows = await getLedgerRows(client);
  const ledgerByFile = new Map(ledgerRows.map((row) => [row.filename, row]));
  const overridesByFile = loadChecksumOverrides();

  if (VERIFY_ONLY) {
    await runVerifyOnly(client, diskMigrations, ledgerByFile, overridesByFile);
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
