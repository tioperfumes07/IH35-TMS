import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import fs from 'node:fs';
import { assertNotProduction } from '../lib/assert-not-production.mjs';
import { prepareExactJournalPopulation, extractBlock, resolvePsqlVars } from './sql-runner.mjs';

test('exact population survives stale statistics and detects blinded RLS', async () => {
  const url = new URL(process.env.PROBE_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname), 'isolated loopback database only');
  assert.match(url.pathname, /probe_test$/);
  const c = new pg.Client({connectionString:url.href});
  await c.connect();
  try {
    await assertNotProduction(c, { isolatedLocalTestDatabase: url.pathname.slice(1) });
    await c.query(`CREATE SCHEMA accounting;
      CREATE TABLE accounting.journal_entries (operating_company_id uuid);
      ALTER TABLE accounting.journal_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE accounting.journal_entries FORCE ROW LEVEL SECURITY;
      CREATE POLICY company_scope ON accounting.journal_entries USING
        (operating_company_id=NULLIF(current_setting('app.operating_company_id',true),'')::uuid);
      GRANT USAGE ON SCHEMA accounting TO ih35_app;
      GRANT SELECT ON accounting.journal_entries TO ih35_app;
      INSERT INTO accounting.journal_entries VALUES
        ('5c854333-6ea5-4faa-af31-67cb272fef80'),('5c854333-6ea5-4faa-af31-67cb272fef80'),
        ('00000000-0000-0000-0000-000000000001');`);
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await prepareExactJournalPopulation(c);
    const src=fs.readFileSync(new URL('../verify-gl-invariants.sql',import.meta.url),'utf8');
    const sql=resolvePsqlVars(src,extractBlock(src,'INV-0'));
    assert.deepEqual((await c.query(sql)).rows,[{je_control:'2',je_control_expected:'2'}]);
    await c.query("SET LOCAL app.operating_company_id='00000000-0000-0000-0000-000000000001'");
    assert.deepEqual((await c.query(sql)).rows,[{je_control:'0',je_control_expected:'2'}]);
    await c.query('ROLLBACK');
  } finally { await c.end(); }
});
