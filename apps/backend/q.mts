import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query("BEGIN READ ONLY"); await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
console.log("routes", JSON.stringify((await c.query(`SELECT s.started_at::text, s.success, s.error_message, s.payload->>'samsara_route_id' rid, l.load_number FROM integrations.integration_sync_log s LEFT JOIN mdata.loads l ON l.id::text = s.payload->>'load_id' WHERE s.sync_kind='route_push' AND s.started_at > '2026-10-01 16:40' ORDER BY s.started_at`)).rows));
await c.query("ROLLBACK"); await c.end();
