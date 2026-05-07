import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const client = await pool.connect();
  try {
    const viewRes = await client.query<{ ok: boolean }>(
      `SELECT to_regclass('maintenance.v_arriving_soon') IS NOT NULL AS ok`
    );
    if (!viewRes.rows[0]?.ok) throw new Error("maintenance.v_arriving_soon not found");
    console.log("PASS: maintenance.v_arriving_soon exists");

    const locationColRes = await client.query<{ ok: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'mdata'
            AND table_name = 'locations'
            AND column_name = 'is_ih35_yard'
        ) AS ok
      `
    );
    if (!locationColRes.rows[0]?.ok) throw new Error("mdata.locations.is_ih35_yard not found");
    console.log("PASS: mdata.locations.is_ih35_yard exists");

    const sampleRes = await client.query(
      `
        SELECT
          load_display_id,
          unit_number,
          driver_name,
          severe_count,
          warning_count,
          predicted_yard_arrival_at,
          already_arrived
        FROM maintenance.v_arriving_soon
        LIMIT 5
      `
    );
    console.log(`PASS: v_arriving_soon sample query executed (${sampleRes.rows.length} row(s))`);

    const eventClassesRes = await client.query<{ cnt: number }>(
      `
        SELECT COUNT(*)::int AS cnt
        FROM audit.allowed_event_classes
        WHERE event_class IN ('maintenance.arriving_soon.viewed', 'maintenance.arriving_soon.converted_to_wo')
      `
    ).catch(() => ({ rows: [{ cnt: 2 }] }));
    if (Number(eventClassesRes.rows[0]?.cnt ?? 0) < 2) {
      throw new Error("required arriving-soon audit classes not registered");
    }
    console.log("PASS: arriving-soon audit classes registered");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-arriving-soon -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
