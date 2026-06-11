import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type pg from "pg";

const MIGRATION_FILE_PATTERN = /^(?:\d{4}[a-z]?|\d{12})_.+\.sql$/i;

export type MigrationDrift = {
  missingInDB: string[];
  extraInDB: string[];
};

export type MigrationLedgerSnapshot = {
  canonicalApplied: string[];
  mirrorApplied: string[];
  onlyInCanonical: string[];
  onlyInMirror: string[];
  checksumMismatches: Array<{ filename: string; ledgerChecksum: string; diskChecksum: string }>;
};

function sortUnique(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function listExpectedMigrations(repoRoot: string): Promise<string[]> {
  const dirs = [path.join(repoRoot, "db", "migrations")];
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
  const reg = await client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`);
  if (reg.rows[0]?.ok) {
    const canonical = await client.query<{ name: string }>(
      `SELECT filename AS name FROM _system._schema_migrations ORDER BY filename ASC`
    );
    return canonical.rows.map((r) => String(r.name));
  }

  const mirrorExists = await client.query(`SELECT to_regclass('ih35_migrations.applied_migrations') IS NOT NULL AS ok`);
  if (!mirrorExists.rows[0]?.ok) return [];

  const mirror = await client.query<{ name: string }>(
    `
      SELECT name
      FROM ih35_migrations.applied_migrations
      ORDER BY name ASC
    `
  );
  return mirror.rows.map((r) => String(r.name));
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

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function getMigrationLedgerSnapshot(client: pg.PoolClient, repoRoot: string): Promise<MigrationLedgerSnapshot> {
  const canonicalReg = await client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`);
  const mirrorReg = await client.query(`SELECT to_regclass('ih35_migrations.applied_migrations') IS NOT NULL AS ok`);

  const canonicalRows = canonicalReg.rows[0]?.ok
    ? await client.query<{ name: string; checksum: string }>(
        `SELECT filename AS name, checksum FROM _system._schema_migrations ORDER BY filename ASC`
      )
    : { rows: [] as Array<{ name: string; checksum: string }> };
  const mirrorRows = mirrorReg.rows[0]?.ok
    ? await client.query<{ name: string }>(`SELECT name FROM ih35_migrations.applied_migrations ORDER BY name ASC`)
    : { rows: [] as Array<{ name: string }> };

  const canonicalApplied = canonicalRows.rows.map((r) => String(r.name));
  const mirrorApplied = mirrorRows.rows.map((r) => String(r.name));
  const canonicalSet = new Set(canonicalApplied);
  const mirrorSet = new Set(mirrorApplied);
  const onlyInCanonical = canonicalApplied.filter((name) => !mirrorSet.has(name));
  const onlyInMirror = mirrorApplied.filter((name) => !canonicalSet.has(name));

  const diskFiles = await listExpectedMigrations(repoRoot);
  const checksumMismatches: Array<{ filename: string; ledgerChecksum: string; diskChecksum: string }> = [];
  for (const file of diskFiles) {
    const ledgerRow = canonicalRows.rows.find((row) => String(row.name) === file);
    if (!ledgerRow?.checksum) continue;
    const fullPath = path.join(repoRoot, "db", "migrations", file);
    if (!fs.existsSync(fullPath)) continue;
    const diskChecksum = sha256(fs.readFileSync(fullPath, "utf8"));
    if (diskChecksum !== ledgerRow.checksum) {
      checksumMismatches.push({
        filename: file,
        ledgerChecksum: ledgerRow.checksum,
        diskChecksum,
      });
    }
  }

  return {
    canonicalApplied,
    mirrorApplied,
    onlyInCanonical,
    onlyInMirror,
    checksumMismatches,
  };
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
  throw new Error(msg);
}
