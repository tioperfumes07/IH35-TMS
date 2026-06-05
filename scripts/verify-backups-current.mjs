#!/usr/bin/env node
/**
 * CLOSURE-23 CI guard — assert Neon PITR is configured and docs/scripts present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-backups-current";
const MIN_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const MAX_PITR_AGE_SECONDS = 60 * 60; // 1 hour
const DEFAULT_PROJECT_ID = "tiny-field-89581227";

function requirePath(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: missing ${rel}`);
    process.exit(1);
  }
}

async function fetchProject(apiKey, projectId) {
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Neon API ${res.status}`);
  return res.json();
}

async function main() {
  for (const rel of [
    "docs/runbooks/DISASTER-RECOVERY.md",
    "docs/runbooks/BACKUP-RESTORE-DRILL.md",
    "scripts/backup-verify-neon-pitr.mjs",
    "scripts/backup-restore-drill.sh",
    ".github/workflows/monthly-restore-drill.yml",
  ]) {
    requirePath(rel);
  }

  const apiKey = process.env.NEON_API_KEY?.trim();
  const projectId = process.env.NEON_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;

  if (!apiKey) {
    console.warn(`[${LABEL}] WARN: NEON_API_KEY unset — structural guard only`);
    console.log(`[${LABEL}] PASS (structural)`);
    return;
  }

  const project = await fetchProject(apiKey, projectId);
  const retention = Number(project.project?.history_retention_seconds ?? project.history_retention_seconds ?? 0);
  if (retention < MIN_RETENTION_SECONDS) {
    console.error(`[${LABEL}] FAIL: PITR retention ${retention}s < 7 days`);
    process.exit(1);
  }

  const updatedAt = project.project?.updated_at ?? project.updated_at;
  if (updatedAt) {
    const ageSec = (Date.now() - new Date(updatedAt).getTime()) / 1000;
    if (ageSec > MAX_PITR_AGE_SECONDS) {
      console.warn(`[${LABEL}] WARN: project last updated ${Math.round(ageSec / 60)}m ago`);
    }
  }

  console.log(`[${LABEL}] PASS — PITR retention ${retention}s`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL:`, err.message || err);
  process.exit(1);
});
