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
    const rels = [
      { schema: "compliance", rel: "form_425c_reports" },
      { schema: "compliance", rel: "form_425c_exhibit_a_entries" },
      { schema: "compliance", rel: "form_425c_exhibit_b_entries" },
    ];
    for (const { schema, rel } of rels) {
      const res = await client.query<{ relrowsecurity: boolean }>(
        `
          SELECT c.relrowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND c.relname = $2
          LIMIT 1
        `,
        [schema, rel]
      );
      if (!res.rows[0]?.relrowsecurity) throw new Error(`${schema}.${rel} row level security not enabled`);
      console.log(`PASS: ${schema}.${rel} has RLS enabled`);
    }
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-form-425c-rls -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
