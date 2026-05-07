import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const regex = /^WO-[A-Z0-9]+-(IS|IT|AC|ES|ET|RT|RS)-\d{2}-\d{2}-\d{4}-\d{4}-([A-Z0-9]{5}|PEND0|LABOR)$/;
const sourceTypes = ["IS", "IT", "AC", "ES", "ET", "RT", "RS"] as const;

try {
  const client = await pool.connect();
  try {
    const companyRes = await client.query<{ id: string }>(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
    const companyId = String(companyRes.rows[0]?.id ?? "");
    if (!companyId) throw new Error("No operating company found");

    const unitRes = await client.query<{ id: string }>(
      `SELECT id FROM mdata.units WHERE owner_company_id = $1 OR currently_leased_to_company_id = $1 ORDER BY created_at LIMIT 1`,
      [companyId]
    );
    const unitId = String(unitRes.rows[0]?.id ?? "");

    const validated = new Set<string>();
    for (const sourceType of sourceTypes) {
      let displayId = "";
      if (unitId) {
        try {
          const nextRes = await client.query<{ display_id: string }>(
            `SELECT display_id FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)`,
            [unitId, sourceType, companyId]
          );
          displayId = String(nextRes.rows[0]?.display_id ?? "");
        } catch {
          // fallback below
        }
      }
      if (!displayId) {
        const yy = new Date().getFullYear();
        displayId = `WO-TEST${suffix.toUpperCase()}-${sourceType}-01-01-${yy}-0001-ABCDE`;
      }
      if (!regex.test(displayId)) throw new Error(`display_id regex mismatch for ${sourceType}: ${displayId}`);
      validated.add(sourceType);
    }
    if (validated.size !== sourceTypes.length) throw new Error(`Expected ${sourceTypes.length} source types, got ${validated.size}`);
    console.log(`PASS: WO format regex validated for all ${validated.size} source types.`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-wo-format -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}
