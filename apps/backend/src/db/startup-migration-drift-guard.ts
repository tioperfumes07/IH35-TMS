import fs from "node:fs";
import path from "node:path";
import type { QueryResult } from "pg";
import { loadHeldMigrationSet } from "./held-migrations.js";

const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;
const SKIP_ENV = "SKIP_MIGRATION_DRIFT_GUARD";

type DriftGuardClient = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult<Record<string, unknown>>>;
};

function listRepoMigrations(repoRoot: string): string[] {
  const dir = path.join(repoRoot, "db", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function hasSkipBypass(): boolean {
  return process.env[SKIP_ENV] === "true";
}

function parseLedgerRows(rows: Array<Record<string, unknown>>) {
  const sysLedger = new Set<string>();
  const appLedger = new Set<string>();
  for (const row of rows) {
    const ledger = String(row.ledger ?? "");
    const migration = String(row.migration ?? "");
    if (!migration) continue;
    if (ledger === "system") sysLedger.add(migration);
    if (ledger === "app") appLedger.add(migration);
  }
  return { sysLedger, appLedger };
}

export async function runStartupMigrationDriftGuard(opts: {
  repoRoot: string;
  client: DriftGuardClient;
}): Promise<void> {
  if (hasSkipBypass()) {
    console.warn(
      JSON.stringify({
        event: "migration_drift_check_bypassed",
        reason: `${SKIP_ENV}=true`,
      })
    );
    return;
  }

  const startedAt = Date.now();
  const repoMigrations = listRepoMigrations(opts.repoRoot);
  const latest = repoMigrations.at(-1) ?? null;

  try {
    const query = await opts.client.query(`
      SELECT 'system'::text AS ledger, filename::text AS migration
      FROM _system._schema_migrations
      UNION ALL
      SELECT 'app'::text AS ledger, name::text AS migration
      FROM ih35_migrations.applied_migrations
    `);
    const { sysLedger, appLedger } = parseLedgerRows(query.rows);
    const unledgered = repoMigrations.filter((name) => !sysLedger.has(name) || !appLedger.has(name));

    // HELD migrations are deliberately left UNLEDGERED on prod: scripts/db-migrate.mjs
    // (shouldSkipHeldOnProd) HELD-SKIPs them so a "DO NOT RUN ON PROD" migration cannot fire on a
    // deploy; the owner hand-applies on a Neon branch and ledger-backfills. That honest pending
    // state is NOT drift, and treating it as drift refuses the backend's boot and fails the deploy
    // (2026-07-13 incident: 202607370000_driver_payment_methods held-skipped -> this guard saw it
    // unledgered -> process.exit(1)).
    //
    // Until now this guard survived only by ACCIDENT: MIGRATION_FILE_PATTERN requires exactly four
    // leading digits, and every held migration happens to be timestamp-style (202607...), so the
    // pattern matched 0 of 72. Registering a held migration under a 4-digit name (0XXX_*.sql) would
    // have exited the process on prod. The sibling guard assertMigrationDriftBootGuard
    // (lib/migration-status.ts) already excludes held explicitly; this makes the two agree by
    // construction instead of by naming convention.
    const heldSet = loadHeldMigrationSet(opts.repoRoot);
    const heldPending = unledgered.filter((name) => heldSet.has(name));
    const missing = unledgered.filter((name) => !heldSet.has(name));

    if (heldPending.length > 0) {
      console.warn(
        JSON.stringify({
          event: "migration_drift_held_pending_ignored",
          held_pending_count: heldPending.length,
          sample: heldPending.slice(0, 5),
        })
      );
    }

    if (missing.length > 0) {
      console.error(
        JSON.stringify({
          event: "migration_drift_detected",
          missing_count: missing.length,
          sample: missing.slice(0, 5),
          sys_ledger_count: sysLedger.size,
          app_ledger_count: appLedger.size,
        })
      );
      process.exit(1);
      return;
    }

    console.info(
      JSON.stringify({
        event: "migration_drift_check_passed",
        total_files: repoMigrations.length,
        latest,
        duration_ms: Date.now() - startedAt,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "migration_drift_check_skipped_db_unreachable",
        error: String((error as Error)?.message ?? error),
      })
    );
    process.exit(1);
  }
}

