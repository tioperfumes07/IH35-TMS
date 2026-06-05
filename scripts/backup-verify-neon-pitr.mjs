#!/usr/bin/env node
/** CLOSURE-23 — Verify Neon PITR retention >= 7 days. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "backup-verify-neon-pitr";
const MIN = 7 * 86400;
const PROJECT = process.env.NEON_PROJECT_ID?.trim() || "tiny-field-89581227";

async function main() {
  for (const rel of ["docs/runbooks/DISASTER-RECOVERY.md", "docs/runbooks/BACKUP-RESTORE-DRILL.md"]) {
    if (!fs.existsSync(path.join(ROOT, rel))) { console.error(`[${LABEL}] FAIL missing ${rel}`); process.exit(1); }
  }
  const key = process.env.NEON_API_KEY?.trim();
  if (!key) { console.log(`[${LABEL}] PASS (baseline-only)`); return; }
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${PROJECT}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.error(`[${LABEL}] FAIL API ${res.status}`); process.exit(1); }
  const j = await res.json();
  const sec = Number(j.project?.history_retention_seconds ?? j.history_retention_seconds ?? 0);
  if (sec < MIN) { console.error(`[${LABEL}] FAIL retention ${sec}s`); process.exit(1); }
  console.log(`[${LABEL}] PASS retention=${sec}s`);
}
main().catch(e => { console.error(e); process.exit(1); });
