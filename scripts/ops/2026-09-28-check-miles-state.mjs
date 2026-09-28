import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
await client.query("BEGIN");
await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
const res = await client.query(`
  SELECT load_number, id::text, miles_shortest, miles_practical, driver_pay_rate_per_mile,
         assigned_primary_driver_id IS NOT NULL AS has_driver
  FROM mdata.loads
  WHERE load_number = ANY($1::text[])
  ORDER BY load_number::int`,
  [Array.from({length:18},(_,i)=>String(13622+i))]
);
await client.query("ROLLBACK");
for (const r of res.rows) console.log(JSON.stringify(r));
await pool.end();
