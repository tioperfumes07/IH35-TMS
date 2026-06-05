#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { createRequire } from "node:module";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(".");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const MIGRATION_FILENAME = /^\d{4}[a-z]?_.+\.sql$/i;
const KNOWN_LOCAL_ORPHAN_NUMBERS = new Set([360, 378, 379, 380]);
const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const JSON_OUTPUT = ARGS.has("--json");

function fail(message) {
  console.error(`runbook:detect-migration-drift FAIL\n- ${message}`);
  process.exit(1);
}

function migrationNumber(name) {
  const prefix = String(name).slice(0, 4);
  const value = Number(prefix);
  return Number.isFinite(value) ? value : null;
}

function classifyKnownLocalArtifacts(orphanedCanonical, diskSet) {
  const localArtifact = [];
  const realOrphans = [];
  const diskNumbers = new Set([...diskSet].map((name) => migrationNumber(name)).filter((n) => Number.isFinite(n)));
  for (const name of orphanedCanonical) {
    const number = migrationNumber(name);
    if (number && KNOWN_LOCAL_ORPHAN_NUMBERS.has(number) && diskNumbers.has(number + 1)) {
      localArtifact.push(name);
      continue;
    }
    realOrphans.push(name);
  }
  return { localArtifact, realOrphans };
}

async function maybeNotifyOwner(summary) {
  const webhook = process.env.MIGRATION_DRIFT_OWNER_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "runbook-detect-migration-drift",
        severity: summary.blocking ? "critical" : "warning",
        summary,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

if (!fs.existsSync(MIGRATIONS_DIR)) fail("missing db/migrations directory");

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) fail("DATABASE_DIRECT_URL or DATABASE_URL is required");

const diskMigrations = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => MIGRATION_FILENAME.test(name))
  .sort((a, b) => a.localeCompare(b));
const diskSet = new Set(diskMigrations);

const client = new Client(buildPgClientConfig(connectionString));
await client.connect();

try {
  const canonicalRows = await client.query(`
    SELECT filename
    FROM _system._schema_migrations
    ORDER BY filename ASC
  `);
  const mirrorRows = await client.query(`
    SELECT name
    FROM ih35_migrations.applied_migrations
    ORDER BY name ASC
  `);

  const canonicalSet = new Set(canonicalRows.rows.map((row) => String(row.filename)));
  const mirrorSet = new Set(mirrorRows.rows.map((row) => String(row.name)));

  const diskMissingInCanonical = [...diskSet].filter((name) => !canonicalSet.has(name)).sort((a, b) => a.localeCompare(b));
  const diskMissingInMirror = [...diskSet].filter((name) => !mirrorSet.has(name)).sort((a, b) => a.localeCompare(b));
  const canonicalNotOnDiskRaw = [...canonicalSet].filter((name) => !diskSet.has(name)).sort((a, b) => a.localeCompare(b));
  const mirrorNotOnDisk = [...mirrorSet].filter((name) => !diskSet.has(name)).sort((a, b) => a.localeCompare(b));

  const classified = classifyKnownLocalArtifacts(canonicalNotOnDiskRaw, diskSet);
  const canonicalNotOnDisk = classified.realOrphans;
  const knownLocalLedgerArtifacts = classified.localArtifact;

  const report = {
    disk_count: diskMigrations.length,
    canonical_count: canonicalSet.size,
    mirror_count: mirrorSet.size,
    drift: {
      disk_missing_in_canonical: diskMissingInCanonical,
      disk_missing_in_mirror: diskMissingInMirror,
      canonical_not_on_disk: canonicalNotOnDisk,
      mirror_not_on_disk: mirrorNotOnDisk,
      known_local_ledger_artifact: knownLocalLedgerArtifacts,
    },
  };

  const blocking =
    diskMissingInCanonical.length > 0 ||
    diskMissingInMirror.length > 0 ||
    canonicalNotOnDisk.length > 0 ||
    mirrorNotOnDisk.length > 0;

  const notified = await maybeNotifyOwner({ blocking, report });

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ...report, owner_notified: notified }, null, 2));
  } else {
    console.log(`Disk migrations: ${report.disk_count}`);
    console.log(`Canonical ledger rows: ${report.canonical_count}`);
    console.log(`Mirror ledger rows: ${report.mirror_count}`);
    console.log(`Disk missing in canonical: ${diskMissingInCanonical.length}`);
    console.log(`Disk missing in mirror: ${diskMissingInMirror.length}`);
    console.log(`Canonical not on disk: ${canonicalNotOnDisk.length}`);
    console.log(`Mirror not on disk: ${mirrorNotOnDisk.length}`);
    console.log(`Known local artifact rows: ${knownLocalLedgerArtifacts.length}`);
    if (knownLocalLedgerArtifacts.length > 0) {
      console.log("Known local artifact candidates:");
      for (const item of knownLocalLedgerArtifacts) console.log(`  - ${item}`);
      console.log("Cleanup path: docs/runbooks/migration-orphan-cleanup.md");
    }
    if (blocking) {
      console.log("OWNER_ALERT required: migration drift needs operator review.");
    } else {
      console.log("No blocking migration drift detected.");
    }
    if (process.env.MIGRATION_DRIFT_OWNER_WEBHOOK_URL) {
      console.log(`Owner notification webhook: ${notified ? "sent" : "failed"}`);
    }
  }

  if (blocking || STRICT) {
    if (blocking) {
      process.exit(1);
    }
  }
} catch (error) {
  fail(String(error?.message ?? error));
} finally {
  await client.end();
}
