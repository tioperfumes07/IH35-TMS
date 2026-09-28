import { register } from "tsx/esm/api";
register();
import pg from "pg";
const { buildTourReadout } = await import("../../apps/backend/src/driver-finance/tour-readout.routes.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

  // Simulate the route: 13609's own tour_id
  const subj = await client.query(`SELECT id::text, tour_id::text FROM mdata.loads WHERE load_number='13609' AND operating_company_id=$1`, [USMCA]);
  console.log("13609 tour_id:", subj.rows[0].tour_id);

  if (!subj.rows[0].tour_id) {
    console.log('ROUTE WOULD RETURN: { tour: null, reason: "this load is not on a tour", legs: [] }');
  }

  // Also prove buildTourReadout itself no longer pulls 13614/13639 when scoped to a
  // (deliberately wrong, pre-existing) settlement + a tour_id that does NOT match them.
  const out = await buildTourReadout(client, USMCA, "2ef96b64-c4bf-4f4e-8bd6-50cf0d8e8224", subj.rows[0].id, "b19dda01-6b81-4eaa-82ec-3cd5227db749");
  console.log("legs when scoped to tour b19dda01 (13614's real tour):", out.legs.map(l => l.load_number));

  const out2 = await buildTourReadout(client, USMCA, "2ef96b64-c4bf-4f4e-8bd6-50cf0d8e8224", null, "8ebae567-44c0-4515-9de1-e44003496fb7");
  console.log("legs when scoped to tour 8ebae567 (13639's real tour):", out2.legs.map((l) => l.load_number));

  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}
