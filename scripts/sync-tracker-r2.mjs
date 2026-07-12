#!/usr/bin/env node
/**
 * Upload the Program Tracker reconciliation artifact to Cloudflare R2 — the LIVE source the backend reads
 * (with the committed file as cold fallback). Mirrors scripts/sync-program-board.mjs --to-r2 exactly.
 *
 * WHY: docs/trackers/block-reconciliation-data.json is produced by reconcile:blocks, which needs
 * `git ls-tree` + `gh pr list --state merged` — tools the prod backend does NOT have. So the numbers
 * (Pending/In-Progress/Completed/By-Module/Sequence) can only be regenerated where git+gh exist = CI.
 * This runs in GitHub Actions (native git+gh+GITHUB_TOKEN, R2 secrets), regenerates the artifact, and
 * writes it to R2 — NO repo commit, NO push to main (branch protection irrelevant), NO redeploy. The
 * tracker refreshes on every MERGE (the workflow cadence), not on manual reconcile.
 *
 * Run AFTER `npm run reconcile:blocks` (which writes the artifact locally). Missing R2 creds → warn +
 * skip (exit 0): the tracker keeps serving the committed fallback until R2_* secrets are set.
 *
 * R2 key: program-tracker/block-reconciliation-data.json  (read by program-tracker.service.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT, "docs/trackers/block-reconciliation-data.json");
const R2_KEY = "program-tracker/block-reconciliation-data.json";

async function main() {
  if (!fs.existsSync(ARTIFACT)) {
    console.error(`[tracker:sync] artifact not found at ${ARTIFACT} — run 'npm run reconcile:blocks' first.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(ARTIFACT, "utf8");
  let counts = {};
  try { counts = JSON.parse(raw).counts || {}; } catch { /* upload verbatim regardless */ }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "ih35-tms-evidence";
  if (!accountId || !accessKeyId || !secretAccessKey) {
    const missing = [!accountId && "R2_ACCOUNT_ID", !accessKeyId && "R2_ACCESS_KEY_ID", !secretAccessKey && "R2_SECRET_ACCESS_KEY"].filter(Boolean);
    console.warn(`[tracker:sync] R2 not configured (missing ${missing.join(", ")}) — SKIPPING upload (exit 0). Tracker serves committed fallback until secrets are set.`);
    return;
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const body = Buffer.from(raw);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: R2_KEY, Body: body, ContentType: "application/json" }));
  // ACCEPTANCE (GUARD): prove the NUMBER, not just "the upload ran". If gh was absent, DONE would be the
  // ~334 undercount instead of ~539 — log the counts so the build/run makes it visible.
  console.log(`[tracker:sync] uploaded -> r2://${bucket}/${R2_KEY} (${body.length} bytes). counts=${JSON.stringify(counts)}`);
}

main().catch((e) => { console.error(`[tracker:sync] upload failed: ${e?.message ?? e}`); process.exit(1); });
