import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
await client.query("BEGIN");
await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

const bySource = await client.query(`
  SELECT actual_arrival_source, count(*) AS n, max(actual_arrival_at) AS newest
  FROM mdata.load_stops
  WHERE actual_arrival_at IS NOT NULL
  GROUP BY actual_arrival_source
  ORDER BY newest DESC NULLS LAST
`);
console.log("load_stops arrival stamps by source:", bySource.rows);

const events = await client.query(`SELECT count(*) AS n, max(occurred_at) AS newest FROM geo.geofence_events`);
console.log("geo.geofence_events:", events.rows[0]);

const stopArrivals = await client.query(`SELECT count(*) AS n, max(triggered_at) AS newest, max(created_at) AS newest_created FROM dispatch.stop_arrivals`);
console.log("dispatch.stop_arrivals:", stopArrivals.rows[0]);

const positions = await client.query(`SELECT count(*) AS n, max(captured_at) AS newest FROM telematics.vehicle_locations WHERE captured_at > now() - interval '1 hour'`);
console.log("telematics.vehicle_locations last 1h:", positions.rows[0]);

await client.query("ROLLBACK");
await client.release();
await pool.end();
