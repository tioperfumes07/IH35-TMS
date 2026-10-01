import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query("BEGIN READ ONLY"); await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
console.log("now", (await c.query(`SELECT now()::text`)).rows[0].now);
console.log("loads", JSON.stringify((await c.query(`SELECT l.load_number, l.status::text, l.updated_at::text FROM mdata.loads l WHERE l.load_number IN ('13626','13637')`)).rows));
console.log("routes", JSON.stringify((await c.query(`SELECT count(*) n, count(*) FILTER (WHERE success) ok, max(started_at)::text, (array_agg(error_message ORDER BY started_at DESC))[1] e FROM integrations.integration_sync_log WHERE sync_kind='route_push' AND started_at > '2026-10-01 16:40'`)).rows));
await c.query("ROLLBACK"); await c.end();
