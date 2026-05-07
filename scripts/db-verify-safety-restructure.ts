import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function relationExists(client: pg.PoolClient, relation: string) {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

const client = await pool.connect();
try {
  const requiredRelations = [
    "safety.civil_fines",
    "safety.internal_fines",
    "safety.dot_inspections",
    "safety.complaints",
    "catalogs.internal_fine_reasons",
    "catalogs.company_violation_types",
    "catalogs.complaint_types",
    "catalogs.maintenance_part_locations",
  ];
  for (const relation of requiredRelations) {
    if (!(await relationExists(client, relation))) {
      throw new Error(`${relation} missing`);
    }
  }

  const seedsRes = await client.query(
    `
      SELECT
        (SELECT COUNT(*) FROM catalogs.internal_fine_reasons) AS internal_fine_reasons_count,
        (SELECT COUNT(*) FROM catalogs.company_violation_types) AS company_violation_types_count,
        (SELECT COUNT(*) FROM catalogs.complaint_types) AS complaint_types_count,
        (SELECT COUNT(*) FROM catalogs.maintenance_part_locations) AS part_location_count
    `
  );
  const seeds = seedsRes.rows[0] as Record<string, string | number>;
  if (Number(seeds.internal_fine_reasons_count ?? 0) < 6) throw new Error("internal_fine_reasons seed count < 6");
  if (Number(seeds.company_violation_types_count ?? 0) < 5) throw new Error("company_violation_types seed count < 5");
  if (Number(seeds.complaint_types_count ?? 0) < 7) throw new Error("complaint_types seed count < 7");
  if (Number(seeds.part_location_count ?? 0) < 40) throw new Error("maintenance_part_locations seed count < 40");

  const policyRes = await client.query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM pg_policies
      WHERE schemaname = 'safety'
        AND tablename = 'complaints'
    `
  );
  if (Number((policyRes.rows[0] as { cnt?: number }).cnt ?? 0) < 1) throw new Error("complaints RLS policies missing");

  console.log("PASS: db-verify-safety-restructure");
} catch (error) {
  console.error(`FAIL: db-verify-safety-restructure -> ${String((error as Error).message || error)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
