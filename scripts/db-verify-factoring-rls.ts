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
    const views = [
      "factoring_summary",
      "factoring_recourse_at_risk",
      "factoring_chargebacks_fees",
      "factoring_statements_settings",
    ];

    for (const relname of views) {
      const relRes = await client.query<{ reloptions: string[] | null }>(
        `
          SELECT c.reloptions
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'views'
            AND c.relname = $1
            AND c.relkind = 'v'
          LIMIT 1
        `,
        [relname]
      );
      const options = relRes.rows[0]?.reloptions ?? [];
      if (!Array.isArray(options) || !options.includes("security_invoker=true")) {
        throw new Error(`views.${relname} missing security_invoker=true`);
      }
      console.log(`PASS: views.${relname} has security_invoker=true`);
    }

    const explainRes = await client.query(
      `
        EXPLAIN
        SELECT *
        FROM views.factoring_recourse_at_risk
        LIMIT 1
      `
    );
    if (!explainRes.rows.length) throw new Error("unable to EXPLAIN views.factoring_recourse_at_risk");
    console.log("PASS: factoring recourse view query plan generated");
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-factoring-rls -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
