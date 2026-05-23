import fs from "node:fs";
import path from "node:path";
import type { QueryResult } from "pg";

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
    const missing = repoMigrations.filter((name) => !sysLedger.has(name) || !appLedger.has(name));

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

