#!/usr/bin/env node
/**
 * PROD MIGRATION-DRIFT AUDIT (read-only diagnostic).
 *
 * GUARD found (2026-06-24) prod tables that the migrations CREATE but that don't exist in prod (42P01),
 * while the from-migrations e2e DB is correct. This audit answers the systemic question: WHICH migrations
 * differ between the repo and what prod actually applied — the blast radius behind verify_no_unledgered_
 * migrations' missing_count. It compares the repo's db/migrations/*.sql (sha256, the SAME hash db-migrate.mjs
 * records) against the live ledger `_system._schema_migrations` (migration, checksum), and reports:
 *
 *   UNAPPLIED  — in the repo, NOT in the ledger -> never ran in this DB.
 *   DRIFT      — in the ledger but the recorded checksum != the repo's current sha256 -> prod applied a
 *                DIFFERENT version of the file (edited-after-apply). Flagged "(override)" if it is a known,
 *                intentional checksum override (the edit is acknowledged but its NEW sql never re-ran), else
 *                "(UNEXPECTED)". This is the most likely cause of "ledgered but the object is missing/wrong".
 *   GHOST      — in the ledger but NOT in the repo (deleted file).
 *   OK         — checksum matches.
 *
 * It ALSO spot-checks a set of catalog tables actually exist (information_schema) — the definitive
 * "ledgered-but-missing" tell GUARD hit live (42P01).
 *
 * READ-ONLY by construction (BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK; --prove-read-only asserts a
 * write is rejected, err 25006). §1.5 safe-by-default: refuses non-localhost unless --remote (the prod run
 * is Jorge's; still read-only). Connection: DATABASE_DIRECT_URL || DATABASE_URL.
 *
 *   node scripts/audit-prod-migration-drift.mjs                 # localhost
 *   DATABASE_URL='<prod read-only>' node scripts/audit-prod-migration-drift.mjs --remote   # prod run (Jorge)
 *   node scripts/audit-prod-migration-drift.mjs --prove-read-only
 *   node scripts/audit-prod-migration-drift.mjs --json
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const OVERRIDES_FILE = path.join(ROOT, "scripts/lib/migration-checksum-overrides.json");
const LEDGER_TABLE = "_system._schema_migrations";

const argv = process.argv.slice(2);
const allowRemote = argv.includes("--remote");
const asJson = argv.includes("--json");
const readOnlyProof = argv.includes("--prove-read-only");

// Catalog tables GUARD probed (definitive existence spot-check). Extend freely.
const SPOTCHECK_TABLES = [
  "catalogs.additional_charges", "catalogs.load_types", "catalogs.detention_reasons",
  "catalogs.pickup_time_types", "catalogs.civil_fine_types", "catalogs.us_states",
  "catalogs.mexico_states", "catalogs.equipment_types",
];

const log = (...a) => console.log(...a);
const err = (...a) => console.error(...a);
const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

function assertHostAllowed(cs) {
  let host = "";
  try { host = (new URL(cs.trim().replace(/^postgres(ql)?:\/\//i, "http://")).hostname || "").toLowerCase(); } catch { host = ""; }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  if (!isLocal && !allowRemote) {
    err(`✘ audit-prod-migration-drift: refusing non-localhost host "${host}" without --remote (CLAUDE.md §1.5; still read-only).`);
    process.exit(1);
  }
  return host;
}

function loadRepoMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ migration: f, checksum: sha256(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")) }));
}
function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return new Set();
  try { return new Set(JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")).map((x) => x.filename)); } catch { return new Set(); }
}

async function main() {
  let pg;
  try { pg = (await import("pg")).default; } catch (e) { err(`✘ 'pg' not available: ${e.message}`); process.exit(1); }
  try { (await import("dotenv")).default.config(); } catch { /* env may be present */ }
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) { err("✘ DATABASE_DIRECT_URL or DATABASE_URL must be set."); process.exit(1); }
  const host = assertHostAllowed(cs);

  const client = new pg.Client(buildPgClientConfig(cs, { connectionTimeoutMillis: 15000 }));
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");

    if (readOnlyProof) {
      try { await client.query("UPDATE _system._schema_migrations SET filename = filename WHERE FALSE"); throw new Error("write NOT rejected — envelope broken"); }
      catch (e) { if (e && e.code === "25006") { log("✅ read-only proof passed (write rejected, 25006)."); await client.query("ROLLBACK"); return; } throw e; }
    }

    const repo = loadRepoMigrations();
    const overrides = loadOverrides();
    const ledgerRows = (await client.query(`SELECT filename, checksum FROM ${LEDGER_TABLE}`)).rows;
    const ledger = new Map(ledgerRows.map((r) => [r.filename, r.checksum]));
    const repoByName = new Map(repo.map((r) => [r.migration, r.checksum]));

    const unapplied = repo.filter((r) => !ledger.has(r.migration)).map((r) => r.migration);
    const drift = repo.filter((r) => ledger.has(r.migration) && ledger.get(r.migration) !== r.checksum)
      .map((r) => ({ migration: r.migration, override: overrides.has(r.migration) }));
    const ghost = ledgerRows.filter((r) => !repoByName.has(r.filename)).map((r) => r.filename);

    const spot = [];
    for (const t of SPOTCHECK_TABLES) {
      const [schema, table] = t.split(".");
      const e = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`${schema}.${table}`]);
      spot.push({ table: t, exists: Boolean(e.rows[0]?.exists) });
    }

    await client.query("ROLLBACK");

    const report = {
      host: host || "(local)", repo_count: repo.length, ledger_count: ledgerRows.length,
      unapplied, drift, ghost, spotcheck: spot,
    };
    if (asJson) { log(JSON.stringify(report, null, 2)); return; }

    log(`\n=== PROD MIGRATION-DRIFT AUDIT (READ-ONLY) — host ${host || "(local)"} ===`);
    log(`repo migrations: ${repo.length}   ledger entries: ${ledgerRows.length}`);
    log(`\n--- UNAPPLIED (in repo, NOT in ledger → never ran here): ${unapplied.length} ---`);
    unapplied.forEach((m) => log(`  • ${m}`));
    log(`\n--- DRIFT (ledgered, but prod applied a DIFFERENT version than the repo): ${drift.length} ---`);
    drift.forEach((d) => log(`  • ${d.migration}  ${d.override ? "(override — edit acknowledged, NEW sql never re-ran)" : "(UNEXPECTED)"}`));
    log(`\n--- GHOST (in ledger, NOT in repo): ${ghost.length} ---`);
    ghost.forEach((m) => log(`  • ${m}`));
    log(`\n--- CATALOG TABLE SPOT-CHECK (definitive ledgered-but-missing tell) ---`);
    spot.forEach((s) => log(`  ${s.exists ? "✅" : "✘ MISSING"}  ${s.table}`));
    const missing = spot.filter((s) => !s.exists).map((s) => s.table);
    log(`\n=== SUMMARY: ${unapplied.length} unapplied · ${drift.length} drift · ${ghost.length} ghost · ${missing.length} spot-checked tables MISSING ===`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => { err(`✘ audit-prod-migration-drift (no retry — surfacing): ${e.stack || e.message}`); process.exit(1); });
