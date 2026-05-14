import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { withLuciaBypass } from "../auth/db.js";

const MIGRATION_FILE_PATTERN = /^\d{4}[a-z]?_.+\.sql$/i;

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function parseAllowPending(): Set<string> {
  const raw = process.env.MIGRATION_ALLOW_PENDING?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export type MigrationVerificationResult = {
  pendingFiles: string[];
  checksumMismatches: Array<{ filename: string; ledger: string; disk: string }>;
};

export async function verifyMigrationsOnStartup(repoRoot: string): Promise<MigrationVerificationResult> {
  const migrationsDir = path.join(repoRoot, "db", "migrations");
  const diskFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort()
    : [];

  const diskByFile = new Map<string, string>();
  for (const file of diskFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    diskByFile.set(file, sha256(sql));
  }

  const ledgerRows = await withLuciaBypass(async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS _system`);
    const exists = await client.query(`SELECT to_regclass('_system._schema_migrations') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) {
      return [] as Array<{ filename: string; checksum: string }>;
    }
    const res = await client.query<{ filename: string; checksum: string }>(
      `SELECT filename, checksum FROM _system._schema_migrations ORDER BY filename ASC`
    );
    return res.rows;
  });

  const ledgerByFile = new Map(ledgerRows.map((r) => [r.filename, r.checksum]));

  const pendingFiles: string[] = [];
  const checksumMismatches: Array<{ filename: string; ledger: string; disk: string }> = [];

  const allowPending = parseAllowPending();

  for (const file of diskFiles) {
    const diskChecksum = diskByFile.get(file);
    const ledgerChecksum = ledgerByFile.get(file);
    if (!diskChecksum) continue;

    if (!ledgerChecksum) {
      if (!allowPending.has(file)) {
        pendingFiles.push(file);
      }
      continue;
    }

    if (ledgerChecksum !== diskChecksum) {
      checksumMismatches.push({ filename: file, ledger: ledgerChecksum, disk: diskChecksum });
    }
  }

  const isProd = process.env.NODE_ENV === "production";
  const strict = process.env.MIGRATION_STRICT === "true";

  for (const mismatch of checksumMismatches) {
    console.warn(
      `[migrations] checksum mismatch for ${mismatch.filename}: ledger=${mismatch.ledger} disk=${mismatch.disk}`
    );
  }

  if (checksumMismatches.length > 0 && isProd && strict) {
    throw new Error(`[migrations] checksum mismatches detected (${checksumMismatches.length}); refusing to start`);
  }

  if (pendingFiles.length > 0) {
    console.warn(`[migrations] pending migrations not applied: ${pendingFiles.join(", ")}`);
    if (isProd && strict) {
      throw new Error(`[migrations] pending migrations not applied; refusing to start`);
    }
  }

  return { pendingFiles, checksumMismatches };
}
