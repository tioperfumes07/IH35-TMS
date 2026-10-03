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
// ── FRESH-DB PRODUCTION-IDENTITY BOOTSTRAP (Lead, 2026-09-30) ────────────────
// Same class, and the same reasoning, as ensureLedgerGrants above: something a migration CANNOT
// do for itself, done by the migrator at the only point where it is possible.
//
// ROOT CAUSE: 202614530000_qbo_flags_permanent_block.sql seeds catalogs.blocked_feature_flags with
// blocked_by_user_id = 'e4117991-d2c0-406d-8cda-74e98d95bccd', an FK to identity.users(id). That
// user is real in PRODUCTION (verified live 2026-09-30) but exists in no migration, so every
// database built from source — CI's ephemeral Postgres, a DR restore, a fresh Neon branch — dies
// there with "insert or update on table blocked_feature_flags violates foreign key constraint
// blocked_feature_flags_blocked_by_user_id_fkey". main CI has been red on this since 2026-09-17.
//
// Why it cannot be fixed in a migration, either by editing or by adding one:
//   - Editing 202614530000 changes the bytes of an APPLIED migration. That was tried (08eee92f52 /
//     #23137) and red'd deploy AND main with a ledger-checksum mismatch; the owner P0'd a
//     byte-for-byte restore (#23149). The immutability law is enforced by checksum, not by honor.
//   - A NEW migration sorts AFTER 202614530000 by construction, so it runs after the failure.
//     202614580000 (the FK-safe follow-up) correctly repairs production drift, but on a fresh
//     database it is never reached. There is no number that sorts before an already-applied file.
// The runner is the only remaining place, exactly as the ledger-grant comment above argues.
//
// Scope, deliberately narrow:
//   - NON-PROD ONLY. Production already has this user; asserting it there is both pointless and a
//     write this script has no business making.
//   - The row cannot authenticate: no email, no google_user_id, no password_hash — same shape as
//     the sanctioned identity.users service account in 202614200000.
//   - Idempotent (ON CONFLICT DO NOTHING) and no-ops until identity.users exists.
const FRESH_DB_PROD_IDENTITY_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// The migration that needs the row. Bootstrapping EARLIER is wrong and was measured wrong: on a
// fresh database identity.users exists as a relation long before it has the columns this INSERT
// writes, so an earlier attempt died with 'column "id" of relation "users" does not exist'
// (CI 2026-09-30T10:50:29Z). Gate on the file that actually needs it — by then the table has
// evolved into its final shape — and verify the columns anyway rather than trusting the order.
const FRESH_DB_IDENTITY_NEEDED_BY = "202614530000_qbo_flags_permanent_block.sql";
let freshDbIdentityBootstrapped = false;
async function ensureFreshDbProductionIdentity(client, file) {
  if (TARGET_IS_PROD || freshDbIdentityBootstrapped) return;
  if (file < FRESH_DB_IDENTITY_NEEDED_BY) return;
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'identity' AND table_name = 'users'`
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  if (!have.has("id") || !have.has("role")) return; // not yet in its final shape — retry next file
  // 'Administrator', not 'Owner': identity carries a role-escalation trigger — "only a primary
  // owner can assign the Owner role" — which refused the insert outright (CI 2026-09-30T10:55:16Z).
  // That control is correct and stays untouched. This row exists ONLY so an FK has something to
  // point at in a throwaway database; nothing reads its role, and 'Administrator' is the same role
  // the sanctioned identity.users service account in 202614200000 uses.
  await client.query(
    `
      INSERT INTO identity.users (id, role)
      VALUES ($1::uuid, 'Administrator')
      ON CONFLICT (id) DO NOTHING
    `,
    [FRESH_DB_PROD_IDENTITY_UUID]
  );
  freshDbIdentityBootstrapped = true;
  console.log(
    `[db:migrate] fresh-DB identity bootstrap: ensured identity.users ${FRESH_DB_PROD_IDENTITY_UUID} before ${file} (non-prod target only)`
  );
}

// ── FRESH-DB PRODUCTION-SCHEMA BOOTSTRAP (Lead, 2026-09-30) ──────────────────
// The SECOND instance of the same class the identity bootstrap above exists for, found the moment
// that one unblocked the chain: production carries a `status_before_void` column on EIGHTEEN money
// tables and NO migration in this repo creates a single one of them. They were added live, by hand,
// and never expressed as a migration. 202614601800_r274_void_status_checks_and_liability_drift.sql
// reads driver_finance.driver_liabilities.status_before_void, so on any database built from source
// it dies with 'column "status_before_void" does not exist' (CI 2026-09-30T11:01:42Z) — and that
// migration is itself ALREADY APPLIED in production (2026-09-30T01:00:42Z), so it cannot be edited.
//
// This is NOT the real fix and must not be mistaken for one. The real fix is a schema-parity
// migration that expresses the full status_before_void family, owned by whoever created those
// columns live. This keeps every fresh database — CI, a DR restore, a new Neon branch — buildable
// until that lands. Non-prod only; IF NOT EXISTS; production is never touched by this path.
const FRESH_DB_SCHEMA_NEEDED_BY = "202614601800_r274_void_status_checks_and_liability_drift.sql";
let freshDbSchemaBootstrapped = false;
async function ensureFreshDbProductionSchema(client, file) {
  if (TARGET_IS_PROD || freshDbSchemaBootstrapped) return;
  if (file < FRESH_DB_SCHEMA_NEEDED_BY) return;
  const present = await client.query(
    `SELECT to_regclass('driver_finance.driver_liabilities') IS NOT NULL AS ok`
  );
  if (!present.rows[0]?.ok) return;
  await client.query(
    `ALTER TABLE driver_finance.driver_liabilities ADD COLUMN IF NOT EXISTS status_before_void text`
  );
  freshDbSchemaBootstrapped = true;
  console.log(
    `[db:migrate] fresh-DB schema bootstrap: ensured driver_finance.driver_liabilities.status_before_void before ${file} (non-prod target only; production drift — needs a real parity migration)`
  );
}

// ── FRESH-DB: telematics.odometer_readings (CC-1, 2026-10-01) ───────────────
// Same class as the bootstrap above. telematics.odometer_readings exists in production but NO
// migration creates it -- it was made live. 202614950000_odometer_readings_gap_rows_and_date_grain_idemp
// .sql ALTERs it (and 202614990000 grants on it), so every database built from source dies with
// 'relation "telematics.odometer_readings" does not exist' (CI 2026-10-01, build-typecheck-heavy, once
// 202614850000 stopped killing the chain first). 202614950000 is applied in production, so it cannot
// be edited. This recreates the table exactly as production carried it BEFORE 202614950000 (read from
// prod's catalog 2026-10-01: odometer_miles NOT NULL -- 950 drops that; the day function and the
// date-grain index are 950's own). Not the real fix: that is a parity migration owned by the table's
// author. Non-prod only; IF NOT EXISTS; production is never touched by this path.
const FRESH_DB_ODOMETER_LEDGER_NEEDED_BY = "202614950000_odometer_readings_gap_rows_and_date_grain_idemp.sql";
let freshDbOdometerLedgerBootstrapped = false;
async function ensureFreshDbOdometerLedger(client, file) {
  if (TARGET_IS_PROD || freshDbOdometerLedgerBootstrapped) return;
  if (file < FRESH_DB_ODOMETER_LEDGER_NEEDED_BY) return;
  const present = await client.query(
    `SELECT to_regclass('telematics.odometer_readings') IS NOT NULL AS ok,
            to_regclass('mdata.units') IS NOT NULL AS units_ok`
  );
  if (present.rows[0]?.ok || !present.rows[0]?.units_ok) {
    freshDbOdometerLedgerBootstrapped = true;
    return;
  }
  await client.query(`
    CREATE TABLE telematics.odometer_readings (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      operating_company_id uuid NOT NULL,
      unit_id uuid NOT NULL REFERENCES mdata.units(id),
      read_at timestamptz NOT NULL,
      odometer_miles numeric NOT NULL,
      source text NOT NULL CHECK (source = ANY (ARRAY['samsara','geofence','manual','fuel_receipt','settlement'])),
      geofence_visit_id uuid,
      recorded_by_user_id uuid,
      confidence text NOT NULL CHECK (confidence = ANY (ARRAY['measured','suggested','entered'])),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT odometer_readings_unit_id_read_at_source_key UNIQUE (unit_id, read_at, source)
    );
    ALTER TABLE telematics.odometer_readings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY odometer_readings_select ON telematics.odometer_readings FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY odometer_readings_insert ON telematics.odometer_readings FOR INSERT
      WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY odometer_readings_update ON telematics.odometer_readings FOR UPDATE
      USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON telematics.odometer_readings TO ih35_app;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
        GRANT SELECT ON telematics.odometer_readings TO ih35_ci_readonly;
      END IF;
    END $$;
  `);
  freshDbOdometerLedgerBootstrapped = true;
  console.log(
    `[db:migrate] fresh-DB schema bootstrap: created telematics.odometer_readings (pre-202614950000 production shape) before ${file} (non-prod target only; production drift — needs a real parity migration)`
  );
}

// ── FRESH-DB: pg_trgm lives in public, as in production (CC-3, ROUND 381.3, 2026-10-03) ─────────
// Production carries pg_trgm in schema `public` (read from pg_extension 2026-10-03). A database built from source gets it
// in `mdata`: 0162 runs CREATE EXTENSION IF NOT EXISTS pg_trgm with mdata first on its search_path. Nothing noticed
// until 202615231000_round296_filter_column_indexes.sql named the operator class schema-qualified —
// `public.gin_trgm_ops` — so every fresh build now dies there ('operator class "public.gin_trgm_ops" does not exist'),
// measured on a local fresh cluster once 202615221200 stopped killing the chain first. 202615231000 is applied in
// production and cannot be edited. This moves the extension to public — the production placement — before it runs.
// Non-prod only; a no-op where pg_trgm is already in public; production is never touched by this path.
const FRESH_DB_TRGM_NEEDED_BY = "202615231000_round296_filter_column_indexes.sql";
let freshDbTrgmBootstrapped = false;
async function ensureFreshDbTrgmInPublic(client, file) {
  if (TARGET_IS_PROD || freshDbTrgmBootstrapped) return;
  if (file < FRESH_DB_TRGM_NEEDED_BY) return;
  const ext = await client.query(
    `SELECT extnamespace::regnamespace::text AS ns FROM pg_extension WHERE extname = 'pg_trgm'`
  );
  freshDbTrgmBootstrapped = true;
  if (!ext.rows[0] || ext.rows[0].ns === "public") return;
  await client.query(`ALTER EXTENSION pg_trgm SET SCHEMA public`);
  console.log(
    `[db:migrate] fresh-DB schema bootstrap: moved pg_trgm from ${ext.rows[0].ns} to public (production placement) before ${file} (non-prod target only)`
  );
}

// ── FRESH-DB: journal_entry_postings.load_id before the refusal that names it (CC-3, 2026-10-03) ────────
// 202615330931_load_born_rows_refuse_a_null_load.sql (CC-3) creates a trigger `UPDATE OF load_id` on
// accounting.journal_entry_postings, but the column is added by 202615350500_journal_entry_postings_load_id_stamp.sql,
// which SORTS AFTER it. Production applied 350500 first (out of numeric order), so it passed there; a database built from
// source runs 330931 first and dies ('column "load_id" of relation "journal_entry_postings" does not exist'), measured on
// a local fresh cluster. Both are applied in production and cannot be edited. This adds the bare column early — exactly
// 350500's own `ADD COLUMN IF NOT EXISTS load_id uuid`; 350500 still adds the FK, index and resolver when it runs.
// Non-prod only; a no-op once the column exists; production is never touched by this path.
const FRESH_DB_POSTING_LOAD_ID_NEEDED_BY = "202615330931_load_born_rows_refuse_a_null_load.sql";
let freshDbPostingLoadIdBootstrapped = false;
async function ensureFreshDbPostingLoadId(client, file) {
  if (TARGET_IS_PROD || freshDbPostingLoadIdBootstrapped) return;
  if (file < FRESH_DB_POSTING_LOAD_ID_NEEDED_BY) return;
  freshDbPostingLoadIdBootstrapped = true;
  const present = await client.query(`SELECT to_regclass('accounting.journal_entry_postings') IS NOT NULL AS ok`);
  if (!present.rows[0]?.ok) return;
  await client.query(`ALTER TABLE accounting.journal_entry_postings ADD COLUMN IF NOT EXISTS load_id uuid`);
  console.log(
    `[db:migrate] fresh-DB schema bootstrap: ensured accounting.journal_entry_postings.load_id before ${file} (non-prod target only; 202615350500 sorts after the refusal that names it)`
  );
}

// ── FRESH-DB: the four fuel tank tables (CC-3, ROUND 381.3, 2026-10-03) ──────────────────────────
// fuel.tank_events, fuel.tank_state, fuel.load_fuel_cost and fuel.unit_mpg exist in production with RLS policies, but NO
// migration in this repo creates them — they were made live. 202615340600_fuel_relay_worm_audit_force_rls.sql FORCEs RLS
// on all four and refuses where a table has no policy, so every database built from source dies there ('relation
// "fuel.load_fuel_cost" does not exist'), measured on a local fresh cluster. 202615340600 is applied in production, so it
// cannot be edited. This recreates the four exactly as production carries them (read from prod's catalog 2026-10-03:
// columns, defaults, keys, checks, FKs, policies) — RLS ENABLED, not forced: forcing is 340600's own work. Not the real
// fix: that is a parity migration owned by the tables' author (fuel lane, CC-2). Non-prod only; skipped when they exist.
const FRESH_DB_FUEL_TANK_NEEDED_BY = "202615340600_fuel_relay_worm_audit_force_rls.sql";
let freshDbFuelTankBootstrapped = false;
async function ensureFreshDbFuelTankTables(client, file) {
  if (TARGET_IS_PROD || freshDbFuelTankBootstrapped) return;
  if (file < FRESH_DB_FUEL_TANK_NEEDED_BY) return;
  freshDbFuelTankBootstrapped = true;
  const present = await client.query(
    `SELECT to_regclass('fuel.load_fuel_cost') IS NOT NULL AS ok, to_regclass('mdata.units') IS NOT NULL AND to_regclass('mdata.loads') IS NOT NULL AS deps_ok`
  );
  if (present.rows[0]?.ok || !present.rows[0]?.deps_ok) return;
  await client.query(`
    CREATE TABLE fuel.tank_events (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      operating_company_id uuid NOT NULL,
      unit_id uuid NOT NULL REFERENCES mdata.units(id),
      event_type text NOT NULL CHECK (event_type = ANY (ARRAY['opening','purchase','burn','adjustment','reversal'])),
      occurred_at timestamptz NOT NULL,
      odometer_miles numeric(10,1),
      gallons numeric(10,3) NOT NULL,
      unit_cost_cents integer,
      extended_cost_cents bigint NOT NULL,
      load_id uuid REFERENCES mdata.loads(id),
      fuel_transaction_id uuid,
      expense_id uuid,
      downtime_event_id uuid,
      mpg_used numeric(6,3),
      mpg_method text CHECK (mpg_method = ANY (ARRAY['tank_to_tank','unit_rolling_90d','fleet_class_default'])),
      idle_rate_gal_per_hour numeric(5,3),
      idle_rate_method text CHECK (idle_rate_method = ANY (ARRAY['samsara_measured','doe_default'])),
      reverses_event_id uuid REFERENCES fuel.tank_events(id),
      filled_to_full boolean NOT NULL DEFAULT false,
      is_sample_data boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by_user_id uuid,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE fuel.tank_state (
      unit_id uuid NOT NULL PRIMARY KEY REFERENCES mdata.units(id),
      operating_company_id uuid NOT NULL,
      as_of timestamptz NOT NULL,
      gallons_on_hand numeric(10,3) NOT NULL,
      value_on_hand_cents bigint NOT NULL,
      avg_cost_per_gallon_cents integer NOT NULL,
      last_event_id uuid NOT NULL REFERENCES fuel.tank_events(id),
      negative_flagged boolean NOT NULL DEFAULT false,
      negative_flagged_at timestamptz
    );
    CREATE TABLE fuel.load_fuel_cost (
      load_id uuid NOT NULL REFERENCES mdata.loads(id),
      unit_id uuid NOT NULL REFERENCES mdata.units(id),
      operating_company_id uuid NOT NULL,
      driven_miles numeric(10,1),
      practical_miles numeric(10,1),
      short_miles numeric(10,1),
      gallons_consumed numeric(10,3),
      avg_cost_per_gallon_cents integer,
      fuel_cost_consumed_cents bigint,
      fuel_cost_purchased_cents bigint NOT NULL,
      mpg_used numeric(6,3),
      mpg_method text CHECK (mpg_method = ANY (ARRAY['tank_to_tank','unit_rolling_90d','fleet_class_default'])),
      confidence text NOT NULL CHECK (confidence = ANY (ARRAY['measured','estimated','unavailable'])),
      missing_reason text,
      computed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (load_id, unit_id)
    );
    CREATE TABLE fuel.unit_mpg (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      operating_company_id uuid NOT NULL,
      unit_id uuid NOT NULL REFERENCES mdata.units(id),
      window_start timestamptz NOT NULL,
      window_end timestamptz NOT NULL,
      miles numeric(10,1) NOT NULL,
      gallons numeric(10,3) NOT NULL,
      mpg numeric(6,3) NOT NULL,
      method text NOT NULL CHECK (method = ANY (ARRAY['tank_to_tank','unit_rolling_90d','fleet_class_default'])),
      sample_size integer NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE fuel.tank_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fuel.tank_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fuel.load_fuel_cost ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fuel.unit_mpg ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tank_events_insert ON fuel.tank_events FOR INSERT WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY tank_events_select ON fuel.tank_events FOR SELECT USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY tank_events_update ON fuel.tank_events FOR UPDATE USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY tank_state_insert ON fuel.tank_state FOR INSERT WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY tank_state_select ON fuel.tank_state FOR SELECT USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY tank_state_update ON fuel.tank_state FOR UPDATE USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY load_fuel_cost_insert ON fuel.load_fuel_cost FOR INSERT WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY load_fuel_cost_select ON fuel.load_fuel_cost FOR SELECT USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY load_fuel_cost_update ON fuel.load_fuel_cost FOR UPDATE USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY unit_mpg_insert ON fuel.unit_mpg FOR INSERT WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    CREATE POLICY unit_mpg_select ON fuel.unit_mpg FOR SELECT USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
        GRANT SELECT, INSERT, UPDATE ON fuel.tank_events, fuel.tank_state, fuel.load_fuel_cost, fuel.unit_mpg TO ih35_app;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
        GRANT SELECT ON fuel.tank_events, fuel.tank_state, fuel.load_fuel_cost, fuel.unit_mpg TO ih35_ci_readonly;
      END IF;
    END $$;
  `);
  console.log(
    `[db:migrate] fresh-DB schema bootstrap: created fuel.tank_events / tank_state / load_fuel_cost / unit_mpg (production shape) before ${file} (non-prod target only; production drift — needs a real parity migration)`
  );
}

// ── FRESH-DB: PRODUCTION-DATA-ONLY MIGRATIONS (Lead, 2026-09-30) ─────────────
// THE THIRD instance today of "production has drifted from the migration set", and I said in the
// second one that a third means the general fix rather than a third special-case. This is that
// general fix for the DATA half; the two bootstraps above remain for the SCHEMA/ROW half, where
// there genuinely is something legitimate to create.
//
// The distinction that matters, and it is not a technicality:
//   - The identity and status_before_void bootstraps above CREATE something a fresh database
//     legitimately needs — an FK target, a column. Creating it is honest.
//   - A migration like 202614640000_fix_usmca_def_item_account_5010.sql REPAIRS PRODUCTION DATA.
//     It corrects two catalogs.items rows for USMCA. On a fresh database USMCA does not exist at
//     all — NO migration inserts it into org.companies — so there is nothing to repair and the
//     migration is a genuine no-op. It nevertheless RAISE EXCEPTIONs on its own precondition
//     ("expected USMCA accounts 5000 and 5010 to both exist"), which kills the whole chain
//     (CI 2026-09-30T13:12:38Z, build-typecheck-heavy).
//
// I wrote that migration, and the bug is mine: a data-repair migration must no-op when its subject
// is absent. 202614090000_load_exception_reasons.sql already does it correctly, with
// `WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = ...)`. Mine raised instead.
//
// IT CANNOT BE EDITED: applied in production 2026-09-30T05:44:33Z, and the ledger enforces
// checksum immutability — #23137 proved that the hard way and the owner P0'd the restore.
//
// SO: on a NON-PROD target only, a migration named here is recorded as applied WITHOUT executing,
// because on a database with no production data it has nothing to do. The alternative — seeding a
// fake USMCA company and a fake chart of accounts into a throwaway database so a repair script has
// something to repair — would be inventing production data to satisfy an assertion, which is worse
// than the problem.
//
// RULES FOR THIS LIST, so it does not become a dumping ground:
//   - NON-PROD ONLY. On production these run normally and are never skipped.
//   - A migration qualifies ONLY if it is pure DATA REPAIR scoped to rows that no migration creates.
//     A migration that creates or alters SCHEMA never belongs here — skipping one of those would
//     make a fresh database structurally different from production, which is the opposite of the
//     goal.
//   - Every entry carries a written reason naming what it repairs and why a fresh database has
//     nothing to repair.
//   - The skip is LOGGED on every run. A silent skip is how a real migration goes missing.
const FRESH_DB_PRODUCTION_DATA_ONLY = new Map([
  [
    "202614640000_fix_usmca_def_item_account_5010.sql",
    "Repairs two catalogs.items rows for USMCA (5c854333-…), flipping DEF line items from account " +
      "5000 to 5010. No migration inserts USMCA into org.companies, so a fresh database has neither " +
      "the company, the accounts, nor the items — nothing to repair. The migration RAISEs on its own " +
      "precondition instead of no-opping, which kills the chain on every fresh build.",
  ],
  [
    "202614850000_pm_catalog_usmca.sql",
    "Inserts USMCA's PM interval catalog rows into catalogs.pm_intervals with a hardcoded USMCA " +
      "operating_company_id (5c854333-…) and no existence guard. No migration inserts USMCA into " +
      "org.companies, so on a fresh database the insert violates pm_intervals_operating_company_id_fkey " +
      "and kills the chain (CI 2026-10-01, build-typecheck-heavy). Pure data, no DDL; applied in " +
      "production 2026-09-30T19:59:25Z, therefore uneditable. The follow-up 202614860000 keeps running " +
      "on fresh databases: its UNIQUE constraint is schema, and its insert selects zero rows there.",
  ],
  [
    "202615000000_bind_usmca_cash_gl_accounts.sql",
    "Creates USMCA GL accounts 1236/1005 via INSERT ... SELECT '<USMCA id>' WHERE NOT EXISTS (same " +
      "account) -- an idempotency check, not a company-existence check -- then binds three USMCA " +
      "bank_accounts rows. No migration inserts USMCA into org.companies, so on a fresh database the " +
      "insert violates accounts_operating_company_id_fkey and kills the chain (CI 2026-10-01). Pure " +
      "data, no DDL; applied in production 2026-09-30T23:12:04Z, therefore uneditable.",
  ],
  [
    "202615221200_usmca_bank_tx_split_flags_on.sql",
    "Turns on two USMCA feature-flag overrides (BANK_TX_SPLIT_ENABLED, BANK_TX_SPLIT_GL_POSTING_ENABLED) in " +
      "lib.feature_flag_overrides. It RAISEs when no Owner user exists and inserts the USMCA id with no company " +
      "existence guard, so a fresh database (no Owner, no USMCA) dies here (ROUND 381.3). Pure data, no DDL; " +
      "applied in production 2026-10-02T12:34:59Z, therefore uneditable.",
  ],
]);

function freshDbProductionDataOnlySkip(file) {
  if (TARGET_IS_PROD) return null;
  return FRESH_DB_PRODUCTION_DATA_ONLY.get(file) ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Ledger a migration WITHOUT executing its SQL. Used only by FRESH_DB_PRODUCTION_DATA_ONLY on a
 * non-prod target -- see that map for the rules. Writes the SAME rows applyMigration() writes, so
 * the ledger and its mirror stay identical in shape and a later checksum check behaves normally.
 */
async function recordMigrationApplied(client, file, checksum) {
  await client.query("BEGIN");
  try {
    await client.query(
      `
        INSERT INTO ${CANONICAL_LEDGER_TABLE} (filename, checksum, duration_ms)
        VALUES ($1, $2, 0);
      `,
      [file, checksum]
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
  // DB-MIGRATE-SESSION-ROLE-DEFAULT (owner urgent report 2026-09-07, found while applying
  // 202613980000): this connection's login role now carries a session-level default that silently
  // drops every connection down to the restricted `ih35_app` runtime role (`current_user` reads
  // `ih35_app` even though `session_user` is the real login role) -- ih35_app has only
  // SELECT/INSERT/UPDATE/DELETE grants (migration 0065), never CREATE SCHEMA / ALTER TABLE / ADD
  // CONSTRAINT, so every migration attempt failed closed with "permission denied for database" /
  // "must be owner of table" the instant this default was introduced, for every login role tested
  // (neondb_owner AND agent_rw), not just this session's credentials. RESET ROLE restores the
  // actual authenticated (table-owning) identity; it is always safe to call, a no-op if no such
  // default exists.
  await client.query("RESET ROLE").catch(() => {});
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

    await ensureFreshDbProductionIdentity(client, file);
    await ensureFreshDbProductionSchema(client, file);
    await ensureFreshDbOdometerLedger(client, file);
    await ensureFreshDbTrgmInPublic(client, file);
    await ensureFreshDbPostingLoadId(client, file);
    await ensureFreshDbFuelTankTables(client, file);
    const dataOnlyReason = freshDbProductionDataOnlySkip(file);
    if (dataOnlyReason) {
      console.log(
        `[db:migrate] fresh-DB production-data-only: recording ${file} as applied WITHOUT executing ` +
          `(non-prod target only) — ${dataOnlyReason}`
      );
      await recordMigrationApplied(client, file, checksum);
      if (!ledgerFilesByChecksum.has(checksum)) ledgerFilesByChecksum.set(checksum, []);
      ledgerFilesByChecksum.get(checksum).push(file);
      ledgerByFile.set(file, { filename: file, checksum });
      continue;
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
