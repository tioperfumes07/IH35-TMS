import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function main() {
  const databaseUrl = process.env.DATABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    console.error("[db-backup] DATABASE_DIRECT_URL is required");
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..", "..");
  const backupsDir = path.join(repoRoot, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(backupsDir, `${stamp}.sql`);

  const res = spawnSync(
    "pg_dump",
    ["--dbname", databaseUrl, "--format", "plain", "--no-owner", "--no-acl", "-f", outFile],
    { stdio: "inherit" }
  );

  if (res.status !== 0) {
    console.error("[db-backup] pg_dump failed");
    process.exit(res.status ?? 1);
  }

  const stat = fs.statSync(outFile);
  if (!stat.size) {
    console.error("[db-backup] Backup file empty:", outFile);
    process.exit(1);
  }

  console.log(`[db-backup] wrote ${outFile} (${stat.size} bytes)`);
}

main();
