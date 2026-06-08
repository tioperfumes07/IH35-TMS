#!/usr/bin/env node
/** CLOSURE-23 CI guard — DR backup artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-23-dr-artifacts";
const REQUIRED = [
  "docs/runbooks/DISASTER-RECOVERY.md",
  "docs/runbooks/BACKUP-RESTORE-DRILL.md",
  "scripts/backup-verify-neon-pitr.mjs",
  "scripts/backup-restore-drill.sh",
  "scripts/backup-checksum-monthly.mjs",
  "scripts/verify-backups-current.mjs",
  ".github/workflows/monthly-restore-drill.yml",
  ".block-ready/CLOSURE-23-DR-BACKUP-AUDIT.json",
];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}
console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts)`);
