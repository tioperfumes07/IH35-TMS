import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

/**
 * Live-DB verifier for the RLS hardening migration
 * (db/migrations/202606080040_enable_rls_bill_lines_expense_lines_line_category_load_required.sql).
 *
 * Asserts, against the connected database (point at prod via DATABASE_DIRECT_URL),
 * for accounting.bill_lines, accounting.expense_lines and
 * accounting.line_category_load_required:
 *   - rowsecurity = true AND forcerowsecurity = true
 *   - the expected RLS policy/policies are present
 *
 * Exit 0 on success, 1 on any failure — usable as a pre-merge / post-deploy gate.
 */

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const EXPECTED = [
  { schema: "accounting", table: "bill_lines", policies: ["bill_lines_company_isolation"] },
  { schema: "accounting", table: "expense_lines", policies: ["expense_lines_company_isolation"] },
  {
    schema: "accounting",
    table: "line_category_load_required",
    policies: ["line_category_load_required_select", "line_category_load_required_write"],
  },
] as const;

try {
  const client = await pool.connect();
  try {
    for (const { schema, table, policies } of EXPECTED) {
      const sec = await client.query<{ rls: boolean; forced: boolean }>(
        `
          SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2
          LIMIT 1
        `,
        [schema, table]
      );
      const row = sec.rows[0];
      if (!row) throw new Error(`${schema}.${table} not found`);
      if (!row.rls) throw new Error(`${schema}.${table} row level security NOT enabled`);
      if (!row.forced) throw new Error(`${schema}.${table} row level security NOT forced`);

      const pol = await client.query<{ polname: string }>(
        `
          SELECT p.polname
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2
        `,
        [schema, table]
      );
      const present = new Set(pol.rows.map((r) => r.polname));
      for (const expected of policies) {
        if (!present.has(expected)) throw new Error(`${schema}.${table} missing policy ${expected}`);
      }

      console.log(`PASS: ${schema}.${table} RLS enabled+forced with policy/policies ${policies.join(", ")}`);
    }
  } finally {
    client.release();
  }
  console.log("db-verify-bill-expense-lines-rls: PASS");
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-bill-expense-lines-rls -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
