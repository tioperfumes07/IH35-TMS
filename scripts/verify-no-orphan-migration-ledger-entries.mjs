#!/usr/bin/env node
import pg from 'pg';
import fs from 'node:fs';
import pgConnectionOptions from './lib/pg-connection-options.cjs';
const { Pool } = pg;
const { buildPgPoolConfig } = pgConnectionOptions;
const MIG_DIR = 'db/migrations';
const GRACE_HOURS = 24;
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool(buildPgPoolConfig(process.env.DATABASE_URL));
  const onDisk = new Set(fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')));
  console.log(`Files on disk: ${onDisk.size}`);
  const { rows: c } = await pool.query(`
    SELECT filename, applied_at FROM _system._schema_migrations
    WHERE applied_at < NOW() - INTERVAL '${GRACE_HOURS} hours'
    ORDER BY filename`);
  const co = c.filter(r => !onDisk.has(r.filename));
  const { rows: m } = await pool.query(`
    SELECT name, applied_at FROM ih35_migrations.applied_migrations
    WHERE applied_at < NOW() - INTERVAL '${GRACE_HOURS} hours'
    ORDER BY name`);
  const mo = m.filter(r => !onDisk.has(r.name));
  await pool.end();
  if (co.length || mo.length) {
    console.error(`\nFAIL: orphan ledger entries detected (grace: ${GRACE_HOURS}h)`);
    if (co.length) {
      console.error('\nCanonical orphans:');
      co.forEach(r => console.error(`  - ${r.filename} (${r.applied_at.toISOString().slice(0,10)})`));
    }
    if (mo.length) {
      console.error('\nMirror orphans:');
      mo.forEach(r => console.error(`  - ${r.name} (${r.applied_at.toISOString().slice(0,10)})`));
    }
    console.error('\nResolve via privileged Neon SQL Editor — see docs/runbooks/migration-orphan-cleanup.md');
    process.exit(1);
  }
  console.log(`OK: no orphan ledger entries (excluding ${GRACE_HOURS}h grace)`);
  process.exit(0);
}
main().catch(e => { console.error('Guard error:', e.message); process.exit(2); });
