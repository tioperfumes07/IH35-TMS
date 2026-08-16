#!/usr/bin/env node
/**
 * verify:applied-migrations-immutable
 *
 * An applied migration is immutable. Editing one after it has run on production
 * makes db-migrate.mjs refuse to migrate ("was modified after apply"), which
 * red-lines every backend pre-deploy until an override is registered.
 *
 * WHY THIS FILE WAS REWRITTEN (BACKEND-PRE-DEPLOY-RED, 2026-08-16)
 * The previous version compared disk content against db/migrations/.ledger.json,
 * a committed snapshot last regenerated 2026-07-15. That snapshot held 353
 * entries while db/migrations carried 877 files, so the guard printed
 * "OK - checked=353" while blind to 524 files (60%) - including the migration
 * that took production's backend deploys down. It also exited 0 when the
 * snapshot was missing entirely. Both are fake greens: a check that cannot see
 * the thing it protects is worse than no check, because it buys false trust.
 *
 * DESIGN
 *   Tier 1 (always): compare disk against the committed snapshot.
 *   Tier 2 (when DATABASE_URL is set): compare disk against the CANONICAL
 *           ledger _system._schema_migrations. Cannot go stale by construction.
 *           Also fails when the snapshot is missing rows the database has, so
 *           snapshot rot is detected instead of silently tolerated.
 *   Overrides: scripts/lib/migration-checksum-overrides.json is honoured with
 *           exactly the semantics db-migrate.mjs uses - an EXACT (ledger, disk)
 *           pair match. One registry, two consumers. A drifting file with no
 *           registered override, or an override whose recorded pair no longer
 *           matches reality, is a hard failure.
 *   Fail-closed: no snapshot and no database means the guard cannot do its job,
 *           and it says so with a non-zero exit rather than passing.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.resolve(ROOT, "db/migrations");
const LEDGER_PATH = path.resolve(MIGRATIONS_DIR, ".ledger.json");
const OVERRIDES_PATH = path.resolve(ROOT, "scripts/lib/migration-checksum-overrides.json");
const CANONICAL_LEDGER_TABLE = "_system._schema_migrations";

// Match BOTH legacy 4-digit (0010_, 0193a_) AND current 12-digit timestamp
// (202606272100_) migration filenames. The old /^\d{4}[a-z]?_/ silently SKIPPED
// every timestamp migration, so the immutability check never covered them (A2-3).
const MIGRATION_FILE_PATTERN = /^\d{4,}[a-z]?_.+\.sql$/i;

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function fail(headline, messageLines) {
  console.error(`verify:applied-migrations-immutable FAILED - ${headline}`);
  for (const line of messageLines) console.error(`- ${line}`);
  process.exit(1);
}

/* -- override registry (identical semantics to db-migrate.mjs) ------------- */

export function loadChecksumOverrides(overridesPath = OVERRIDES_PATH) {
  if (!fs.existsSync(overridesPath)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
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

/* -- snapshot ledger ------------------------------------------------------- */

function parseLedgerEntries(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.migrations)) return parsed.migrations;
  if (Array.isArray(parsed.entries)) return parsed.entries;
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([filename, checksum]) => ({ filename, checksum }));
  }
  throw new Error("unsupported ledger JSON shape");
}

function normalizeLedgerEntry(entry) {
  const filename = entry?.filename ?? entry?.name ?? entry?.migration;
  const checksum = entry?.checksum ?? entry?.sha256 ?? entry?.hash;
  if (typeof filename !== "string" || typeof checksum !== "string") return null;
  return { filename: filename.trim(), checksum: checksum.trim() };
}

export function readSnapshotLedger(ledgerPath = LEDGER_PATH) {
  if (!fs.existsSync(ledgerPath)) return null;
  return parseLedgerEntries(fs.readFileSync(ledgerPath, "utf8"))
    .map(normalizeLedgerEntry)
    .filter(Boolean);
}

/* -- canonical ledger (authoritative; cannot go stale) --------------------- */

async function readCanonicalLedger(databaseUrl) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT filename, checksum FROM ${CANONICAL_LEDGER_TABLE} ORDER BY filename ASC;`
    );
    return rows.map((r) => ({ filename: String(r.filename).trim(), checksum: String(r.checksum).trim() }));
  } finally {
    await client.end();
  }
}

/* -- core comparison ------------------------------------------------------- */

export function compareAgainstLedger({ entries, migrationsDir = MIGRATIONS_DIR, overridesByFile }) {
  const covered = entries.filter((e) => MIGRATION_FILE_PATTERN.test(e.filename));
  const mismatches = [];
  const overridden = [];

  for (const entry of covered) {
    const filePath = path.resolve(migrationsDir, entry.filename);
    if (!fs.existsSync(filePath)) {
      mismatches.push({
        filename: entry.filename,
        ledgerChecksum: entry.checksum,
        diskChecksum: "MISSING",
        kind: "file-deleted",
      });
      continue;
    }
    const diskChecksum = sha256(fs.readFileSync(filePath, "utf8"));
    if (diskChecksum === entry.checksum) continue;

    if (isChecksumOverrideMatch(overridesByFile, entry.filename, entry.checksum, diskChecksum)) {
      overridden.push(entry.filename);
      continue;
    }
    mismatches.push({
      filename: entry.filename,
      ledgerChecksum: entry.checksum,
      diskChecksum,
      kind: overridesByFile.has(entry.filename) ? "override-stale" : "content-drift",
    });
  }
  return { checked: covered.length, mismatches, overridden };
}

function describe(mismatch) {
  if (mismatch.kind === "file-deleted") {
    return `${mismatch.filename}: applied to the database (sha=${mismatch.ledgerChecksum}) but the file is GONE from db/migrations. An applied migration file must never be deleted - it is the record of what ran. Restore it from git history.`;
  }
  if (mismatch.kind === "override-stale") {
    return `${mismatch.filename}: an override is registered but its recorded pair no longer matches reality (ledger sha=${mismatch.ledgerChecksum}, disk sha=${mismatch.diskChecksum}). The file was edited AGAIN after the override was written. Do not widen the override - restore the file or justify a new pair with live proof.`;
  }
  return `${mismatch.filename}: ledger sha=${mismatch.ledgerChecksum} disk sha=${mismatch.diskChecksum}. Applied migrations are immutable. To change behavior, add a NEW migration with the next available number. Do not modify ${mismatch.filename}. If the edit is a proven no-op on already-applied databases, register it in scripts/lib/migration-checksum-overrides.json with live proof in the reason field.`;
}

/* -- entry point ----------------------------------------------------------- */

async function main() {
  const overridesByFile = loadChecksumOverrides();
  const snapshot = readSnapshotLedger();
  const databaseUrl = process.env.DATABASE_URL || "";

  let canonical = null;
  let canonicalError = null;
  if (databaseUrl) {
    try {
      canonical = await readCanonicalLedger(databaseUrl);
    } catch (error) {
      canonicalError = error;
    }
  }

  if (!snapshot && !canonical) {
    fail("guard has no ledger to check against", [
      `db/migrations/.ledger.json is missing and no usable DATABASE_URL was available${canonicalError ? ` (${canonicalError.message})` : ""}.`,
      "This guard exits non-zero rather than passing: a migration-immutability check with nothing to compare against cannot protect anything.",
      "Regenerate the snapshot with: npm run db:ledger:snapshot",
    ]);
  }

  // UNION, never substitution. A coder's DATABASE_URL may point at a small local verify database
  // rather than production; using it as the SOLE source would silently check 40 migrations instead
  // of 954 and still print OK. Coverage may only ever ratchet up, so both sources are checked and
  // their findings merged. Where both know a file, the canonical ledger's checksum wins because it
  // is the record of what actually ran.
  const merged = new Map();
  for (const entry of snapshot ?? []) merged.set(entry.filename, entry);
  for (const entry of canonical ?? []) merged.set(entry.filename, entry);
  const entries = [...merged.values()];

  const source = canonical
    ? `union(canonical-ledger ${canonical.length} + snapshot ${snapshot ? snapshot.length : 0})`
    : "snapshot(db/migrations/.ledger.json)";
  const result = compareAgainstLedger({ entries, overridesByFile });

  const diskCount = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).length;

  if (result.mismatches.length > 0) {
    fail(
      `${result.mismatches.length} applied migration(s) differ from disk [source=${source}]`,
      result.mismatches.map(describe)
    );
  }

  // Snapshot rot: the database knows about applied migrations the committed
  // snapshot has never heard of. This is exactly how the guard went blind for a
  // month. Only detectable when the database is reachable, so it is enforced
  // there and reported honestly everywhere else.
  if (canonical && snapshot) {
    const snapshotNames = new Set(snapshot.map((e) => e.filename));
    const missing = canonical.filter((e) => !snapshotNames.has(e.filename)).map((e) => e.filename);
    if (missing.length > 0) {
      fail(`snapshot is stale - ${missing.length} applied migration(s) absent from db/migrations/.ledger.json`, [
        `Database has ${canonical.length} applied migrations; the committed snapshot covers ${snapshot.length}.`,
        `First missing: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ""}`,
        "A stale snapshot is why this guard reported OK while production deploys were broken.",
        "Fix with: npm run db:ledger:snapshot  (db:migrate also refreshes it automatically on a successful apply)",
      ]);
    }
  }

  if (canonicalError) {
    console.warn(
      `verify:applied-migrations-immutable WARNING - DATABASE_URL was set but unreachable (${canonicalError.message}). ` +
        "Fell back to the committed snapshot; snapshot-rot detection did NOT run this time."
    );
  }

  const overriddenNote = result.overridden.length > 0 ? `, overridden=${result.overridden.length}` : "";
  console.log(
    `verify:applied-migrations-immutable OK - source=${source}, checked=${result.checked}${overriddenNote}, ` +
      `disk_migration_files=${diskCount}`
  );
}

main().catch((error) => {
  fail("guard crashed", [error?.stack || String(error)]);
});
