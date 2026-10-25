import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
await c.query("BEGIN READ ONLY"); await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
const sqls = process.argv.slice(2);
for (const s of sqls) { try { const r = await c.query(s); console.log(JSON.stringify(r.rows)); } catch(e) { console.log("ERR", e.message); } }
await c.query("ROLLBACK"); c.release(); await pool.end();
