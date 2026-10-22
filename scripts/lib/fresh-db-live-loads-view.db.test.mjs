import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { assertNotProduction } from './assert-not-production.mjs';
import { prepareFreshLiveLoadsView, LIVE_LOADS_MIGRATION } from './fresh-db-live-loads-view.mjs';

test('empty PG16 view rebuild preserves grants; populated rows and dependencies refuse atomically', async () => {
  const url = new URL(process.env.FRESH_VIEW_TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  const options = { file: LIVE_LOADS_MIGRATION, hostname: url.hostname, database };
  try {
    await assertNotProduction(client, { freshLoopbackMigration: options });
    await client.query(`CREATE SCHEMA mdata; CREATE SCHEMA views;
      CREATE TABLE mdata.loads(id int, accepted_at timestamptz, team_id uuid);
      CREATE VIEW views.live_loads AS SELECT * FROM mdata.loads;
      GRANT SELECT ON views.live_loads TO PUBLIC`);
    // Old code fails on precisely the production projection order.
    await assert.rejects(client.query('CREATE OR REPLACE VIEW views.live_loads AS SELECT id,team_id,accepted_at FROM mdata.loads'), /cannot change name/);
    await client.query('BEGIN');
    const restore = await prepareFreshLiveLoadsView(client, options);
    await client.query('CREATE VIEW views.live_loads WITH (security_invoker=true) AS SELECT id,team_id,accepted_at FROM mdata.loads');
    await restore();
    await client.query('COMMIT');
    assert.equal((await client.query("SELECT has_table_privilege('public','views.live_loads','SELECT') AS allowed")).rows[0].allowed, true);
    await client.query('INSERT INTO mdata.loads(id) VALUES(1)');
    await client.query('BEGIN');
    await assert.rejects(prepareFreshLiveLoadsView(client, options), /zero load rows/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT count(*)::int n FROM views.live_loads')).rows[0].n, 1);
    // Roll back the test insertion, not business data: recreate a separate empty fixture table.
    await client.query('BEGIN');
    await client.query('TRUNCATE mdata.loads');
    await client.query('CREATE VIEW views.dependent AS SELECT * FROM views.live_loads');
    await assert.rejects(prepareFreshLiveLoadsView(client, options), /depend/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT count(*)::int n FROM views.live_loads')).rows[0].n, 1);
  } finally { await client.end(); }
});
