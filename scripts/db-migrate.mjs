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
import { loadHeldSet, shouldSkipHeldOnProd } from "./lib/held-migrations.mjs";
import { writeLedgerSnapshot } from "./db-ledger-snapshot.mjs";

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

// ── HELD-MIGRATION SAFETY GUARD (2026-07-12) ─────────────────────────────────
// A migration registered in db/migrations/.held-migrations.json ("DO NOT RUN ON PROD")
// must NEVER be executed by an automated prod deploy — it runs only on a Neon branch by
// the owner's hand. `.held-migrations.json` + the SQL marker + verify-hold-migrations-
// registered.mjs are static checks with no runtime teeth; the runner below now enforces
// the hold at execution time. Held migrations still apply on non-prod targets (CI fresh
// DB, local, Neon branch) so the schema stays complete. The ceremony flag is separate
// from ALLOW_PROD_MIGRATE on purpose (prod deploys set that, so reusing it would defeat
// the control) — an explicit ALLOW_HELD_PROD_MIGRATE=1 is required to apply a held
// migration against prod.
const ALLOW_HELD_PROD_MIGRATE = process.env.ALLOW_HELD_PROD_MIGRATE === "1";
let HELD_SET;
try {
  HELD_SET = loadHeldSet(path.resolve("db/migrations"));
} catch (error) {
  console.error(`[db:migrate] REFUSED — could not load .held-migrations.json: ${error.message}`);
  console.error("  The held-migration registry gates prod execution; a migrate cannot proceed without it.");
  process.exit(1);
}
if (TARGET_IS_PROD && ALLOW_HELD_PROD_MIGRATE) {
  console.error("[db:migrate] WARNING: ALLOW_HELD_PROD_MIGRATE=1 — HELD migrations WILL be applied to PRODUCTION.");
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
// LV-087-REPAIR: mirror-side repair for the SAFE divergence direction only. See runRepairMirror().
const REPAIR_MIRROR = ARGS.has("--repair-mirror");

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

// The two ledger tables are created HERE, by the migrator, before any migration runs — so no
// migration can grant them, and for the whole life of this repo nothing did. Prod reads them fine
// only because the grant was made by hand at some point; it exists in no file. Every database built
// from source — CI's ephemeral one, a DR restore, a fresh Neon branch — therefore has NO grant, and
// launch-readiness.service.ts:134 (`SELECT COUNT(*) FROM _system._schema_migrations`) fails there
// with "permission denied for table _schema_migrations". Verified both directions 2026-08-06:
// prod has_table_privilege('ih35_app', '_system._schema_migrations', 'SELECT') = true; no
// db/migrations/*.sql contains a GRANT for it.
//
// Granting here, at the point of creation, is the only self-contained place for it: a migration
// cannot reliably grant a table the migrator itself needs before migrations run.
async function ensureLedgerGrants(client) {
  // Role-guarded because on a genuinely fresh database this runs BEFORE 0006 creates ih35_app.
  // That first pass no-ops; the call after the apply loop then lands it in the same run.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
        RAISE NOTICE 'ledger grants: role ih35_app absent (pre-0006) — deferred to post-apply pass';
        RETURN;
      END IF;
      GRANT USAGE ON SCHEMA _system, ih35_migrations TO ih35_app;
      -- SELECT only. The application READS the ledger to answer "are we fully migrated?"; it must
      -- never write it. The migrator writes as the migration role, not as ih35_app.
      GRANT SELECT ON _system._schema_migrations TO ih35_app;
      GRANT SELECT ON ih35_migrations.applied_migrations TO ih35_app;
    END
    $$;
  `);
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
  await ensureLedgerGrants(client);
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
  const noTransaction = /^\s*--\s*IH35_MIGRATION_NO_TRANSACTION\b/m.test(sql);
  const hasExplicitTx = /\bBEGIN\b/i.test(sql) && /\bCOMMIT\b/i.test(sql);
  await client.query(`SET search_path = ${SEARCH_PATH};`);

  // PostgreSQL forbids CREATE INDEX CONCURRENTLY inside a transaction block. A migration carrying
  // this explicit marker is one atomic DDL statement and is ledgered only after that statement
  // succeeds. Never infer this from SQL keywords/comments: the author must opt in visibly.
  if (noTransaction || hasExplicitTx) {
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

/**
 * LV-087-REPAIR — repair a one-sided ledger row in the ONE direction that is provably safe.
 *
 * WHY THIS EXISTS: insertLedgerRow() writes BOTH ledgers, but any out-of-band apply (psql, the Neon
 * console, a hand-run script) can write `_system._schema_migrations` alone. That canonical-only row
 * then trips the LV-087 refusal and EVERY backend deploy dies in pre-deploy `db:migrate` until a
 * human works it out. That happened on 2026-08-16: 202612581400_owner_all_entities_non_qbo_flags_on.sql
 * was applied at 01:06:58Z by cursor-usmca-lead, the mirror row never landed, and six consecutive
 * backend deploys failed over ~20 minutes.
 *
 * WHY ONLY ONE DIRECTION: the canonical ledger is written by insertLedgerRow ONLY after the DDL has
 * run, so canonical-present => applied. Copying it into the mirror records a fact already true.
 * The reverse (mirror-only) is the DANGEROUS direction the guard exists for -- backend boot accepts a
 * migration present in EITHER ledger, so a mirror-only row can make an unapplied migration look
 * applied. This function REFUSES to touch that direction and exits non-zero if any exists.
 *
 * It never writes the canonical ledger, and never applies DDL.
 */
async function runRepairMirror(client, ledgerRows, mirrorRows, ledgerByFile, mirrorByFile, knownLedgerOrphans) {
  const dangerous = [];
  for (const row of mirrorRows) {
    const name = row.name;
    if (ledgerByFile.has(name) || HELD_SET.has(name) || knownLedgerOrphans.has(name)) continue;
    dangerous.push(name);
  }
  if (dangerous.length > 0) {
    throw new Error(
      `LV-087-REPAIR: refusing to run. ${dangerous.length} migration(s) are in ${MIRROR_LEDGER_TABLE} ` +
        `ONLY:\n  ${dangerous.join("\n  ")}\n` +
        `That is the dangerous direction -- boot would treat them as applied while the DDL may never ` +
        `have run. --repair-mirror only ever copies canonical -> mirror. Resolve these by hand.`
    );
  }

  const toMirror = [];
  for (const row of ledgerRows) {
    const name = row.filename;
    if (mirrorByFile.has(name) || HELD_SET.has(name) || knownLedgerOrphans.has(name)) continue;
    toMirror.push(name);
  }
  if (toMirror.length === 0) {
    console.log("LV-087-REPAIR: ledgers already agree. Nothing to repair.");
    return;
  }
  for (const name of toMirror) {
    await client.query(
      `INSERT INTO ${MIRROR_LEDGER_TABLE} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;`,
      [name]
    );
    console.log(`MIRRORED ${name} (canonical row already present -> DDL already applied)`);
  }
  console.log(`LV-087-REPAIR: inserted ${toMirror.length} mirror row(s). Re-run db:migrate.`);
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
  // Declared here (not below the LV-087 block) because the ledger-divergence check needs it.
  const mirrorByFile = new Map(mirrorRows.map((row) => [row.name, row]));
  // LV-087: checksum -> the filename(s) already applied under it. A byte-identical file re-applied
  // under a NEW number is a renumber-and-reapply, and idempotency is the only thing that has stopped
  // it corrupting the schema so far. Four such pairs already exist on prod.
  // The frozen LV-087 baseline: duplicates that predate the guard and cannot be unmade (both files are
  // already on the prod ledger). Shared with verify-migration-checksum-collision.mjs so the two can never
  // disagree. Without this, a FRESH database (CI) applies 0237 then hits the refusal on 0238 and dies —
  // the refusal must block NEW duplicates without breaking a from-scratch migrate of the existing history.
  const grandfathered = new Set();
  const knownLedgerOrphans = new Set();
  try {
    const baseline = JSON.parse(
      fs.readFileSync(new URL("./known-migration-ledger-exceptions.json", import.meta.url), "utf8")
    );
    for (const entry of baseline.duplicates ?? []) {
      for (const f of entry.files ?? []) grandfathered.add(`${entry.checksum}::${f}`);
    }
    for (const entry of baseline.ledger_orphans ?? []) {
      if (entry?.file) knownLedgerOrphans.add(entry.file);
    }
  } catch (error) {
    throw new Error(
      `LV-087: cannot read known-migration-ledger-exceptions.json (${error.message}). Refusing to migrate ` +
        `rather than silently dropping the duplicate-checksum protection.`
    );
  }

  // LV-087 (second clause) — THE TWO LEDGERS MUST AGREE, OR THE DISAGREEMENT MUST BE EXPLAINED.
  //
  // Backend boot accepts a migration that appears in EITHER ledger. So a row in the mirror alone is
  // enough to make a migration look applied even if it never ran — the ledger can lie in the direction
  // of "already done", which is the dangerous direction: the DDL is missing while everything reports
  // healthy. Only two things legitimately explain a one-sided row:
  //   (a) the file is in the held union (held + applied_held + superseded) — a held migration is
  //       hand-applied on a Neon branch and mirror-backfilled BY DESIGN, so mirror-only is correct; or
  //   (b) it is a frozen orphan recorded in known-migration-ledger-exceptions.json.
  // Anything else is an unexplained divergence and stops the run before a single migration is applied.
  //
  // Prod on 2026-08-05: canonical 876, mirror 883, canonical-only 0, mirror-only 7 = 6 held + 1 frozen
  // orphan. Zero unexplained, so this refusal is armed against the NEXT one rather than papering over
  // a current mess.
  const ledgerDivergence = [];
  for (const row of mirrorRows) {
    const name = row.name;
    if (ledgerByFile.has(name) || HELD_SET.has(name) || knownLedgerOrphans.has(name)) continue;
    ledgerDivergence.push(`${name}: in ${MIRROR_LEDGER_TABLE} only (not canonical, not held, not baselined)`);
  }
  for (const row of ledgerRows) {
    const name = row.filename;
    if (mirrorByFile.has(name) || HELD_SET.has(name) || knownLedgerOrphans.has(name)) continue;
    ledgerDivergence.push(`${name}: in ${CANONICAL_LEDGER_TABLE} only (not mirrored, not held, not baselined)`);
  }
  // LV-087-REPAIR must be reachable WHEN A DIVERGENCE EXISTS -- that is the only time it is needed.
  // --backfill-ledger sits below the throw at the bottom of this function and is therefore dead on
  // arrival for this failure mode; it also skips anything already in the canonical ledger, so it
  // could never have repaired a mirror gap. Handle the repair here, before the refusal.
  if (REPAIR_MIRROR) {
    await runRepairMirror(client, ledgerRows, mirrorRows, ledgerByFile, mirrorByFile, knownLedgerOrphans);
    process.exit(0);
  }

  if (ledgerDivergence.length > 0) {
    throw new Error(
      `LV-087: the two migration ledgers disagree on ${ledgerDivergence.length} migration(s) that the held ` +
        `registry does not explain:\n  ${ledgerDivergence.join("\n  ")}\n` +
        `A one-sided ledger row makes a migration look applied to the boot check while its DDL may never ` +
        `have run.\n` +
        `If the row is in ${CANONICAL_LEDGER_TABLE} ONLY, the DDL DID run (that ledger is written only ` +
        `after a successful apply) and the mirror row is simply missing -- repair it with:\n` +
        `    npm run db:repair-mirror\n` +
        `If the row is in ${MIRROR_LEDGER_TABLE} only, do NOT auto-repair: the DDL may never have run. ` +
        `Apply the migration, or record it in known-migration-ledger-exceptions.json with the evidence.`
    );
  }

  const ledgerFilesByChecksum = new Map();
  for (const row of ledgerRows) {
    if (!ledgerFilesByChecksum.has(row.checksum)) ledgerFilesByChecksum.set(row.checksum, []);
    ledgerFilesByChecksum.get(row.checksum).push(row.filename);
  }
  const overridesByFile = loadChecksumOverrides();

  if (VERIFY_ONLY) {
    await runVerifyOnly(client, diskMigrations, ledgerByFile, mirrorByFile, overridesByFile);
    process.exit(0);
  }

  if (BACKFILL_LEDGER) {
    await runBackfillLedger(client, diskMigrations, ledgerByFile);
    process.exit(0);
  }

  const heldSkipped = [];
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

    if (shouldSkipHeldOnProd({ file, heldSet: HELD_SET, isProd: TARGET_IS_PROD, allowHeldProdMigrate: ALLOW_HELD_PROD_MIGRATE })) {
      // Registered HELD + target is prod + no explicit ceremony flag → do NOT execute.
      // Not ledgered: it stays honestly pending on prod until the owner applies it by hand.
      heldSkipped.push(file);
      console.log(`HELD-SKIP ${file} (registered in .held-migrations.json — not run on prod; owner applies on a Neon branch)`);
      continue;
    }

    // LV-087 — REFUSE A RENUMBER-AND-REAPPLY.
    //
    // If this exact SQL has already been applied under a DIFFERENT filename, applying it again is not
    // a new migration: it is the same DDL re-run under a new number. Prod already carries four such
    // pairs (fuel_03_overage_engine, fuel_03_overage_events_unit_fk, c9_form_roundtrip,
    // ar_collection_tasks). Those were harmless only because the SQL happened to be idempotent —
    // `IF NOT EXISTS` absorbed the second run. That is luck, not a control. The same mistake with a
    // non-idempotent statement (an UPDATE, an INSERT of seed rows, an ALTER that appends) double-applies
    // it, and on the financial cluster that means duplicated data or a doubled balance with no error.
    //
    // Refusing here stops it at the source rather than detecting it afterwards. The override file is
    // deliberately NOT consulted: it exists to accept a checksum CHANGE on the same filename, which is
    // the opposite situation.
    const priorFiles = (ledgerFilesByChecksum.get(checksum) ?? []).filter((f) => f !== file);
    if (priorFiles.length > 0 && !grandfathered.has(`${checksum}::${file}`)) {
      throw new Error(
        `Migration ${file} has the SAME checksum (${checksum}) as already-applied ${priorFiles.join(", ")}. ` +
          `This is a renumber-and-reapply of identical DDL, not a new migration. If the change is genuinely ` +
          `needed again, write a migration that expresses the NEW intent; do not re-run the old file under a ` +
          `new number. (Prod carries 4 such pairs that were harmless only because their SQL was idempotent.)`
      );
    }

    console.log(`APPLY ${file}`);
    await applyMigration(client, file, sql, checksum);
    if (!ledgerFilesByChecksum.has(checksum)) ledgerFilesByChecksum.set(checksum, []);
    ledgerFilesByChecksum.get(checksum).push(file);
    ledgerByFile.set(file, { filename: file, checksum });
  }

  if (heldSkipped.length > 0) {
    console.log(
      `Held (NOT applied on prod): ${heldSkipped.length} migration(s) — ${heldSkipped.join(", ")}`
    );
  }
  // ACCT-F117 — POST-APPLY EFFECT ASSERTION. Verify what the database actually CONTAINS, not what
  // the ledger claims was run.
  //
  // Migration 0094 added these three enum labels, is recorded applied in BOTH ledgers, and the
  // labels are not on prod. Nothing noticed for months: the ledger row was treated as proof. The
  // cost was real — 202610291200 had to rewrite the abandonment trigger to compare status::text
  // because casting the missing literals raised 22P02 and aborted EVERY load status UPDATE on
  // mdata.loads, and driver-finance/abandonment.service.ts still throws on its uncast write.
  //
  // So after applying, we ASK THE DATABASE. This runs on the prod preDeploy, which is the only
  // place the question can be answered honestly — CI's ephemeral database is built from these same
  // migrations and would agree with itself no matter what.
  //
  // Deliberately a hard failure, not a warning: a deploy that silently loses a schema change is the
  // exact defect being closed, and a warning is how it stayed invisible the first time.
  const REQUIRED_ENUM_LABELS = [
    { schema: "mdata", type: "load_status_enum", labels: ["abandoned", "driver_walkoff", "driver_no_show"] },
  ];
  for (const req of REQUIRED_ENUM_LABELS) {
    const present = await client.query(
      `SELECT e.enumlabel::text AS label
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typname = $2`,
      [req.schema, req.type]
    );
    // A missing TYPE is not this check's business — a database that has not reached the migration
    // creating it (a fresh partial run) must not be failed by an assertion about its contents.
    if (present.rowCount === 0) continue;
    const have = new Set(present.rows.map((r) => r.label));
    const missing = req.labels.filter((l) => !have.has(l));
    if (missing.length > 0) {
      throw new Error(
        `POST-APPLY CHECK FAILED: ${req.schema}.${req.type} is missing ${missing.length} required ` +
          `label(s): ${missing.join(", ")}. Migrations reported success and the ledger will say ` +
          `"applied", but the type does not contain them — which is precisely how 0094 was lost. ` +
          `Do NOT re-run and do NOT edit an applied migration; add a NEW migration containing ONLY ` +
          `the ALTER TYPE ... ADD VALUE statements, so nothing else in its transaction can roll ` +
          `them back.`
      );
    }
  }

  // Second pass: on a fresh database the bootstrap call above ran before 0006 existed to create
  // ih35_app, so it deferred. 0006 has certainly run by now.
  await ensureLedgerGrants(client);

  // ASK THE DATABASE, same as the enum assertion above — a GRANT that silently did not take is the
  // failure mode being closed here, and the whole point is that it was invisible for months.
  const ledgerGrants = await client.query(
    `SELECT has_table_privilege('ih35_app', '_system._schema_migrations', 'SELECT')      AS canonical,
            has_table_privilege('ih35_app', 'ih35_migrations.applied_migrations', 'SELECT') AS mirror
       WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app')`
  );
  const g = ledgerGrants.rows[0];
  if (g && !(g.canonical && g.mirror)) {
    throw new Error(
      `POST-APPLY CHECK FAILED: ih35_app cannot SELECT the migration ledger ` +
        `(_system._schema_migrations=${g.canonical}, ih35_migrations.applied_migrations=${g.mirror}). ` +
        `The application reads these to answer "are we fully migrated?", so the backend boot check ` +
        `and launch-readiness both fail closed without them.`
    );
  }

  // Refresh the committed snapshot that verify:applied-migrations-immutable falls back to where
  // there are no database credentials (CI). BACKEND-PRE-DEPLOY-RED: hand-refreshing rotted for a
  // month (353 cached entries vs 877 files on disk) and the guard reading it reported OK the whole
  // time while production deploys were broken. Writing it here means the coder who applies a
  // migration gets the refreshed snapshot in their working tree and commits it alongside.
  // Non-fatal: the migrations are already committed by this point and the canonical ledger in the
  // database is the source of truth. A snapshot write failure must never fail a deploy — but it is
  // reported loudly, never swallowed.
  try {
    const snapshotCount = await writeLedgerSnapshot({
      client,
      ledgerPath: path.resolve(MIGRATIONS_DIR, ".ledger.json"),
      sourceLabel: "db:migrate",
    });
    console.log(`Ledger snapshot refreshed — ${snapshotCount} applied migrations written to db/migrations/.ledger.json`);
  } catch (snapshotError) {
    console.warn(
      `WARNING: migrations applied, but refreshing db/migrations/.ledger.json failed (${snapshotError.message}). ` +
        `Run 'npm run db:ledger:snapshot' and commit the result, or CI's immutability guard will drift blind.`
    );
  }

  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
