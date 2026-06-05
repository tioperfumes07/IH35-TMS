#!/usr/bin/env node
/**
 * CLOSURE-23 — Monthly backup checksum baseline (row counts + critical tables).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "backup-checksum-monthly";

const PROBE_QUERIES = [
  { key: "companies", sql: "SELECT COUNT(*)::bigint AS cnt FROM org.companies" },
  { key: "users", sql: "SELECT COUNT(*)::bigint AS cnt FROM identity.users" },
  { key: "customers", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.customers" },
  { key: "vendors", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.vendors" },
  {
    key: "driver_settlements",
    sql: "SELECT COUNT(*)::bigint AS cnt FROM driver_finance.driver_settlements",
  },
  {
    key: "qbo_sync_completed",
    sql: "SELECT COUNT(*)::bigint AS cnt FROM qbo.sync_runs WHERE status = 'completed'",
  },
];

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function checksumPath(month) {
  return path.join(ROOT, "docs/audits", `backup-checksums-${month}.json`);
}

async function collectCounts(connectionString) {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const counts = {};
  try {
    for (const probe of PROBE_QUERIES) {
      const res = await client.query(probe.sql);
      counts[probe.key] = Number(res.rows[0]?.cnt ?? 0);
    }
  } finally {
    await client.end();
  }
  return counts;
}

function simpleChecksum(counts) {
  const payload = JSON.stringify(counts);
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function main() {
  const month = monthKey();
  const outPath = checksumPath(month);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const dbUrl = process.env.DATABASE_URL?.trim();
  let counts = null;

  if (dbUrl) {
    counts = await collectCounts(dbUrl);
    console.log(`[${LABEL}] collected live counts from DATABASE_URL`);
  } else {
    counts = {
      companies: null,
      users: null,
      customers: null,
      vendors: null,
      driver_settlements: null,
      qbo_sync_completed: null,
      note: "baseline placeholder — re-run with DATABASE_URL for live counts",
    };
    console.warn(`[${LABEL}] WARN: DATABASE_URL unset — writing placeholder baseline`);
  }

  const artifact = {
    block: "CLOSURE-23-DR-BACKUP-AUDIT",
    month,
    generated_at: new Date().toISOString(),
    counts,
    checksum: counts.companies != null ? simpleChecksum(counts) : null,
  };

  const prevPath = checksumPath(
    month === "2026-01"
      ? "2025-12"
      : `${month.slice(0, 5)}${String(Number(month.slice(5)) - 1).padStart(2, "0")}`
  );
  if (fs.existsSync(prevPath) && artifact.checksum) {
    const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
    if (prev.checksum && prev.checksum !== artifact.checksum) {
      console.warn(`[${LABEL}] WARN: checksum drift vs prior month (${prev.checksum} → ${artifact.checksum})`);
    }
  }

  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`[${LABEL}] wrote ${path.relative(ROOT, outPath)}`);
  console.log(`[${LABEL}] PASS`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL:`, err.message || err);
  process.exit(1);
});
