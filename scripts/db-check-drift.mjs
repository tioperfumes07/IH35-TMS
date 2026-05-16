import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { createRequire } from "node:module";
import { verifyMigrationContent } from "./lib/migration-content-verifier.mjs";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL in environment.");
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve("db/migrations");
const CHECKSUM_OVERRIDES_FILE = path.resolve("scripts/lib/migration-checksum-overrides.json");
const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;
const ARGS = new Set(process.argv.slice(2));
const JSON_OUTPUT = ARGS.has("--json");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function listDiskMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort();
}

function loadOverrides() {
  if (!fs.existsSync(CHECKSUM_OVERRIDES_FILE)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(CHECKSUM_OVERRIDES_FILE, "utf8"));
  const map = new Map();
  for (const item of parsed) {
    if (!item?.filename || !item?.ledger_checksum || !item?.disk_checksum) continue;
    map.set(item.filename, item);
  }
  return map;
}

function checksumOverrideAccepted(overridesByFile, filename, ledgerChecksum, diskChecksum) {
  const override = overridesByFile.get(filename);
  if (!override) return false;
  return override.ledger_checksum === ledgerChecksum && override.disk_checksum === diskChecksum;
}

async function tableExists(client, fqName) {
  const res = await client.query(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [fqName]);
  return Boolean(res.rows[0]?.ok);
}

async function canonicalLedgerRows(client) {
  const exists = await tableExists(client, "_system._schema_migrations");
  if (!exists) return [];
  const res = await client.query(
    `
      SELECT filename, checksum, applied_at
      FROM _system._schema_migrations
      ORDER BY filename ASC
    `
  );
  return res.rows;
}

async function mirrorLedgerRows(client) {
  const exists = await tableExists(client, "ih35_migrations.applied_migrations");
  if (!exists) return [];
  const res = await client.query(
    `
      SELECT name, applied_at
      FROM ih35_migrations.applied_migrations
      ORDER BY name ASC
    `
  );
  return res.rows;
}

function issueCount(report) {
  return (
    report.pending.length +
    report.appliedButUnlogged.ledgerMirror.length +
    report.appliedButUnlogged.liveSchema.length +
    report.checksumDrift.length +
    report.ledgerDivergence.onlyInCanonical.length +
    report.ledgerDivergence.onlyInMirror.length
  );
}

function printReport(report) {
  console.log(`Canonical ledger: ${report.canonicalLedger}`);
  console.log(`Mirror ledger: ${report.mirrorLedger}`);
  console.log(`Disk migrations: ${report.counts.disk}`);
  console.log(`Applied canonical: ${report.counts.canonicalApplied}`);
  console.log(`Applied mirror: ${report.counts.mirrorApplied}`);
  console.log(`Pending: ${report.pending.length}`);
  console.log(`Applied-but-unlogged (mirror): ${report.appliedButUnlogged.ledgerMirror.length}`);
  console.log(`Applied-but-unlogged (live schema): ${report.appliedButUnlogged.liveSchema.length}`);
  console.log(`Checksum-drifted: ${report.checksumDrift.length}`);
  console.log(`Ledger divergence canonical-only: ${report.ledgerDivergence.onlyInCanonical.length}`);
  console.log(`Ledger divergence mirror-only: ${report.ledgerDivergence.onlyInMirror.length}`);

  for (const name of report.pending) console.log(`  PENDING ${name}`);
  for (const name of report.appliedButUnlogged.ledgerMirror) console.log(`  UNLOGGED_MIRROR ${name}`);
  for (const name of report.appliedButUnlogged.liveSchema) console.log(`  UNLOGGED_SCHEMA ${name}`);
  for (const item of report.checksumDrift) {
    const suffix = item.overrideAccepted ? " (override accepted)" : "";
    console.log(`  CHECKSUM_DRIFT ${item.filename}${suffix}`);
  }
  for (const name of report.ledgerDivergence.onlyInCanonical) console.log(`  CANONICAL_ONLY ${name}`);
  for (const name of report.ledgerDivergence.onlyInMirror) console.log(`  MIRROR_ONLY ${name}`);
}

const { Client } = pg;
const client = new Client(buildPgClientConfig(connectionString));

try {
  await client.connect();

  const diskMigrations = listDiskMigrations();
  const diskSet = new Set(diskMigrations);
  const diskChecksums = new Map(
    diskMigrations.map((file) => [file, sha256(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))])
  );
  const overridesByFile = loadOverrides();

  const canonicalRows = await canonicalLedgerRows(client);
  const mirrorRows = await mirrorLedgerRows(client);
  const canonicalByFile = new Map(canonicalRows.map((row) => [String(row.filename), String(row.checksum ?? "")]));
  const canonicalSet = new Set([...canonicalByFile.keys()]);
  const mirrorSet = new Set(mirrorRows.map((row) => String(row.name)));

  const pending = diskMigrations.filter((file) => !canonicalSet.has(file));
  const onlyInCanonical = [...canonicalSet].filter((name) => !diskSet.has(name)).sort();
  const onlyInMirror = [...mirrorSet].filter((name) => !canonicalSet.has(name)).sort();

  const checksumDrift = [];
  for (const file of diskMigrations) {
    if (!canonicalByFile.has(file)) continue;
    const ledgerChecksum = canonicalByFile.get(file);
    const diskChecksum = diskChecksums.get(file);
    if (!ledgerChecksum || !diskChecksum || ledgerChecksum === diskChecksum) continue;
    checksumDrift.push({
      filename: file,
      ledgerChecksum,
      diskChecksum,
      overrideAccepted: checksumOverrideAccepted(overridesByFile, file, ledgerChecksum, diskChecksum),
    });
  }

  const appliedButUnloggedMirror = pending.filter((file) => mirrorSet.has(file));
  const appliedButUnloggedSchema = [];

  for (const file of pending) {
    const migrationNumber = Number(file.slice(0, 4));
    const result = await verifyMigrationContent({
      client,
      migrationsDirectory: MIGRATIONS_DIR,
      minNumber: migrationNumber,
      maxNumber: migrationNumber,
    });
    const perFile = result.report.find((entry) => entry.filename === file);
    if (!perFile) continue;
    const expectedObjectCount = Object.values(perFile.expectedCounts).reduce((sum, n) => sum + Number(n ?? 0), 0);
    if (expectedObjectCount > 0 && perFile.missing.length === 0) {
      appliedButUnloggedSchema.push(file);
    }
  }

  const report = {
    canonicalLedger: "_system._schema_migrations",
    mirrorLedger: "ih35_migrations.applied_migrations",
    counts: {
      disk: diskMigrations.length,
      canonicalApplied: canonicalRows.length,
      mirrorApplied: mirrorRows.length,
    },
    pending,
    appliedButUnlogged: {
      ledgerMirror: appliedButUnloggedMirror,
      liveSchema: appliedButUnloggedSchema,
    },
    checksumDrift,
    ledgerDivergence: {
      onlyInCanonical,
      onlyInMirror,
    },
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  const blockingChecksumDrift = report.checksumDrift.filter((row) => !row.overrideAccepted);
  const hasBlocking =
    report.pending.length > 0 ||
    report.appliedButUnlogged.ledgerMirror.length > 0 ||
    report.appliedButUnlogged.liveSchema.length > 0 ||
    blockingChecksumDrift.length > 0 ||
    report.ledgerDivergence.onlyInCanonical.length > 0 ||
    report.ledgerDivergence.onlyInMirror.length > 0;

  if (hasBlocking) {
    console.error(`db:check-drift found ${issueCount(report)} issue(s).`);
    process.exit(1);
  }

  console.log("db:check-drift OK");
} catch (error) {
  console.error(`db:check-drift failed: ${String(error?.message ?? error)}`);
  process.exit(1);
} finally {
  await client.end();
}
