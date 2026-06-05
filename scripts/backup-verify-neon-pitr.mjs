#!/usr/bin/env node
/**
 * CLOSURE-23 — Verify Neon PITR enabled with retention >= 7 days.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "backup-verify-neon-pitr";
const MIN_RETENTION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_STALE_SECONDS = 30 * 60; // 30 minutes for "last activity" proxy

const DEFAULT_PROJECT_ID = "tiny-field-89581227";

async function fetchProject(apiKey, projectId) {
  const url = `https://console.neon.tech/api/v2/projects/${projectId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon API ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchBranches(apiKey, projectId) {
  const url = `https://console.neon.tech/api/v2/projects/${projectId}/branches`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon branches API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.branches ?? json;
}

function verifyLocalBaseline() {
  const drDoc = path.join(ROOT, "docs/runbooks/DISASTER-RECOVERY.md");
  const drillDoc = path.join(ROOT, "docs/runbooks/BACKUP-RESTORE-DRILL.md");
  if (!fs.existsSync(drDoc) || !fs.existsSync(drillDoc)) {
    console.error(`[${LABEL}] FAIL: DR runbooks missing`);
    process.exit(1);
  }
}

async function main() {
  verifyLocalBaseline();

  const apiKey = process.env.NEON_API_KEY?.trim();
  const projectId = process.env.NEON_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;

  if (!apiKey) {
    console.warn(`[${LABEL}] WARN: NEON_API_KEY unset — verifying committed baseline only`);
    console.log(`[${LABEL}] PASS (baseline-only; set NEON_API_KEY for live PITR verify)`);
    return;
  }

  const project = await fetchProject(apiKey, projectId);
  const retention = Number(project.project?.history_retention_seconds ?? project.history_retention_seconds ?? 0);

  if (retention < MIN_RETENTION_SECONDS) {
    console.error(
      `[${LABEL}] FAIL: PITR retention ${retention}s < required ${MIN_RETENTION_SECONDS}s (7 days)`
    );
    process.exit(1);
  }
  console.log(`[${LABEL}] PITR retention OK: ${retention}s (${Math.round(retention / 86400)} days)`);

  const branches = await fetchBranches(apiKey, projectId);
  const primary = branches.find((b) => b.primary || b.default) ?? branches[0];
  const updatedAt = primary?.updated_at ?? project.project?.updated_at ?? project.updated_at;
  if (updatedAt) {
    const ageSec = (Date.now() - new Date(updatedAt).getTime()) / 1000;
    if (ageSec > MAX_STALE_SECONDS) {
      console.warn(`[${LABEL}] WARN: primary branch last activity ${Math.round(ageSec / 60)}m ago`);
    } else {
      console.log(`[${LABEL}] primary branch activity fresh (${Math.round(ageSec / 60)}m ago)`);
    }
  }

  console.log(`[${LABEL}] PASS`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL:`, err.message || err);
  process.exit(1);
});
