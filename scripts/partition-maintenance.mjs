#!/usr/bin/env node
/**
 * Block 26 — Partition Maintenance Cron
 * Run monthly (1st of each month) to:
 *   1. Create next 2 months of partitions for audit_log_partitioned
 *   2. Log what was created
 *   3. Remind about archival of old partitions
 *
 * Usage: node scripts/partition-maintenance.mjs
 */
import pg from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createPartitionIfNeeded(client, year, month) {
  const tableName = `audit_log_${String(year).padStart(4, "0")}_${String(month).padStart(2, "0")}`;
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  // Calculate next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const toDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { rows } = await client.query(`
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = $1 AND n.nspname = 'public'
  `, [tableName]);

  if (rows.length === 0) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName}
        PARTITION OF audit_log_partitioned
        FOR VALUES FROM ('${fromDate}') TO ('${toDate}')
    `);
    console.log(`[partition-maintenance] Created partition: ${tableName} (${fromDate} to ${toDate})`);

    // Log the creation
    await client.query(`
      INSERT INTO partition_maintenance_log (table_name, action, partition_name, from_date, to_date, notes)
      VALUES ('audit_log_partitioned', 'created', $1, $2, $3, 'auto-created by maintenance cron')
    `, [tableName, fromDate, toDate]);
  } else {
    console.log(`[partition-maintenance] Partition already exists: ${tableName}`);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based

    console.log(`[partition-maintenance] Running at ${now.toISOString()}`);

    // Create current month + next 2 months
    for (let i = 0; i <= 2; i++) {
      let m = month + i;
      let y = year;
      while (m > 12) { m -= 12; y += 1; }
      await createPartitionIfNeeded(client, y, m);
    }

    // Archival reminder (7-year IRS retention)
    const cutoffYear = year - 7;
    console.log(`[partition-maintenance] Archival check: partitions before ${cutoffYear} may be eligible for archival.`);
    console.log(`[partition-maintenance] Run: SELECT partition_name FROM partition_maintenance_log WHERE from_date < '${cutoffYear}-01-01' to identify candidates.`);
    console.log(`[partition-maintenance] Manual step required: pg_dump partition → verify → DROP TABLE`);

    console.log(`[partition-maintenance] Done.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[partition-maintenance] FATAL:", err);
  process.exit(1);
});
