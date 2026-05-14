import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[db-restore-check] Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function adminPostgresUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const maintenanceDb = process.env.PGMAINTENANCE_DB?.trim() || "postgres";
  url.pathname = `/${maintenanceDb}`;
  return url.toString();
}

function targetDatabaseUrl(databaseUrl: string, dbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(dbName)}`;
  return url.toString();
}

function main() {
  const backupPathArg = process.argv[2];
  if (!backupPathArg) {
    console.error("[db-restore-check] Usage: npm run db:restore-check -- <path-to-backup.sql>");
    process.exit(1);
  }

  const resolved = path.resolve(backupPathArg);
  if (!fs.existsSync(resolved)) {
    console.error("[db-restore-check] Backup file not found:", resolved);
    process.exit(1);
  }

  const databaseUrl = requireEnv("DATABASE_DIRECT_URL");
  const base = new URL(databaseUrl);
  const sourceDb = decodeURIComponent(base.pathname.replace(/^\//, "").split("?")[0] ?? "");
  if (!sourceDb) {
    console.error("[db-restore-check] DATABASE_DIRECT_URL must include a database name");
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/-/g, "_");
  const tempDb = `restore_check_${stamp}`;

  const adminUrl = adminPostgresUrl(databaseUrl);
  const create = spawnSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${tempDb}";`], {
    stdio: "inherit",
  });
  if (create.status !== 0) {
    console.error("[db-restore-check] CREATE DATABASE failed (needs local Postgres privileges; Neon often blocks CREATE DATABASE)");
    process.exit(create.status ?? 1);
  }

  const targetUrl = targetDatabaseUrl(databaseUrl, tempDb);
  let restoreStatus = 0;
  try {
    const restore = spawnSync("psql", [targetUrl, "-v", "ON_ERROR_STOP=1", "-f", resolved], { stdio: "inherit" });
    restoreStatus = restore.status ?? 1;
    if (restoreStatus !== 0) {
      console.error("[db-restore-check] psql restore failed");
    } else {
      console.log("[db-restore-check] OK", { tempDb, backup: resolved });
    }
  } finally {
    const drop = spawnSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS "${tempDb}" WITH (FORCE);`], {
      stdio: "inherit",
    });
    if (drop.status !== 0) {
      console.error("[db-restore-check] DROP DATABASE failed — manual cleanup may be required:", tempDb);
      process.exit(drop.status ?? 1);
    }
  }

  if (restoreStatus !== 0) process.exit(restoreStatus);
}

main();
