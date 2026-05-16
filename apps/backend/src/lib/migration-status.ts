import fs from "node:fs";
import path from "node:path";
import type pg from "pg";

const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;

export type MigrationDrift = {
  missingInDB: string[];
  extraInDB: string[];
};

function sortUnique(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function listExpectedMigrations(repoRoot: string): Promise<string[]> {
  const dirs = [path.join(repoRoot, "db", "migrations"), path.join(repoRoot, "apps", "backend", "migrations")];
  const names: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!MIGRATION_FILE_PATTERN.test(entry)) continue;
      names.push(entry);
    }
  }
  return sortUnique(names);
}

export async function listAppliedMigrations(client: pg.PoolClient): Promise<string[]> {
  const reg = await client.query(`SELECT to_regclass('ih35_migrations.applied_migrations') IS NOT NULL AS ok`);
  if (reg.rows[0]?.ok) {
    const ih35 = await client.query<{ name: string }>(
      `SELECT name FROM ih35_migrations.applied_migrations ORDER BY name ASC`
    );
    return ih35.rows.map((r) => String(r.name));
  }

  const legacyExists = await client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`);
  if (!legacyExists.rows[0]?.ok) return [];

  const legacy = await client.query<{ name: string }>(
    `
      SELECT filename AS name
      FROM _system._schema_migrations
      ORDER BY filename ASC
    `
  );
  return legacy.rows.map((r) => String(r.name));
}

export async function findMigrationDrift(client: pg.PoolClient, repoRoot: string): Promise<MigrationDrift> {
  const expected = await listExpectedMigrations(repoRoot);
  const applied = await listAppliedMigrations(client);

  const expectedSet = new Set(expected);
  const appliedSet = new Set(applied);

  const missingInDB = expected.filter((name) => !appliedSet.has(name));
  const extraInDB = applied.filter((name) => !expectedSet.has(name));

  return { missingInDB, extraInDB };
}

export function skipMigrationVerificationEnabled(): boolean {
  return process.env.SKIP_MIGRATION_VERIFICATION === "true";
}

export async function assertMigrationDriftBootGuard(opts: {
  repoRoot: string;
  client: pg.PoolClient;
  logError: (obj: Record<string, unknown>, msg: string) => void;
}): Promise<void> {
  if (process.env.IH35_BOOT_API_SMOKE === "true" && process.env.NODE_ENV === "test") {
    return;
  }
  const drift = await findMigrationDrift(opts.client, opts.repoRoot);
  if (drift.missingInDB.length === 0) return;

  const msg = `[boot] migration drift detected: missing in DB: ${drift.missingInDB.join(", ")}`;
  if (skipMigrationVerificationEnabled()) {
    opts.logError({ drift }, `${msg} — continuing because SKIP_MIGRATION_VERIFICATION=true`);
    return;
  }
  throw new Error(msg);
}
