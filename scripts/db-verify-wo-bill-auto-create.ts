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

async function hasColumn(client: pg.PoolClient, schema: string, table: string, column: string) {
  const res = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `,
    [schema, table, column]
  );
  return res.rowCount === 1;
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const woLineFkColumn = (await hasColumn(client, "maintenance", "work_order_lines", "work_order_uuid"))
    ? "work_order_uuid"
    : "work_order_id";
  const woLinePkColumn = (await hasColumn(client, "maintenance", "work_order_lines", "uuid")) ? "uuid" : "id";
  const woLineTotalColumn = (await hasColumn(client, "maintenance", "work_order_lines", "total_cost"))
    ? "total_cost"
    : "amount";

  const companyId = String((await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`)).rows[0]?.id ?? "");
  if (!companyId) throw new Error("company_not_found");
  const unitId = String((await client.query(`SELECT id FROM mdata.units ORDER BY created_at LIMIT 1`)).rows[0]?.id ?? "");
  if (!unitId) throw new Error("unit_not_found");

  const woRes = await client.query(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, repair_location, description, opened_at, display_id, unit_sequence
      ) VALUES ($1,'repair','IS','open',$2,'in_house',$3,now(),$4,9999)
      RETURNING id
    `,
    [companyId, unitId, `verify two section ${suffix}`, `WO-TEST-IS-01-01-2026-9999-${suffix.toUpperCase().slice(0, 5)}`]
  );
  const woId = String(woRes.rows[0]?.id ?? "");
  if (!woId) throw new Error("wo_create_failed");

  const parentB1 = await client.query(
    `
      INSERT INTO maintenance.work_order_lines (${woLineFkColumn}, line_type, description, quantity, unit_cost, ${woLineTotalColumn}, section)
      VALUES ($1,'other','Repair parent 1',1,100,100,'B')
      RETURNING ${woLinePkColumn}
    `,
    [woId]
  );
  const parentB2 = await client.query(
    `
      INSERT INTO maintenance.work_order_lines (${woLineFkColumn}, line_type, description, quantity, unit_cost, ${woLineTotalColumn}, section)
      VALUES ($1,'other','Repair parent 2',1,100,100,'B')
      RETURNING ${woLinePkColumn}
    `,
    [woId]
  );
  const b1 = String(parentB1.rows[0]?.[woLinePkColumn] ?? "");
  const b2 = String(parentB2.rows[0]?.[woLinePkColumn] ?? "");

  await client.query(
    `
      INSERT INTO maintenance.work_order_lines (${woLineFkColumn}, line_type, description, quantity, unit_cost, ${woLineTotalColumn}, section, parent_line_uuid)
      VALUES
      ($1,'parts','Part row 1',1,20,20,'B',$2),
      ($1,'labor','Labor row 1',1,30,30,'B',$2),
      ($1,'parts','Part row 2',1,20,20,'B',$3),
      ($1,'labor','Labor row 2',1,30,30,'B',$3)
    `,
    [woId, b1, b2]
  );
  await client.query(
    `
      INSERT INTO maintenance.work_order_lines (${woLineFkColumn}, line_type, description, quantity, unit_cost, ${woLineTotalColumn}, section)
      VALUES
      ($1,'other','A line 1',1,10,10,'A'),
      ($1,'other','A line 2',1,15,15,'A')
    `,
    [woId]
  );

  const billRes = await client.query(
    `
      INSERT INTO accounting.bills (operating_company_id, linked_work_order_uuid, status, bill_date, due_date, total_amount)
      VALUES ($1,$2,'draft',CURRENT_DATE,CURRENT_DATE + INTERVAL '30 days',295)
      RETURNING id
    `,
    [companyId, woId]
  );
  const billId = String(billRes.rows[0]?.id ?? "");
  if (!billId) throw new Error("bill_create_failed");

  const sourceRows = await client.query(
    `
      SELECT ${woLinePkColumn} AS line_id, section, parent_line_uuid, ${woLineTotalColumn} AS line_total, description
      FROM maintenance.work_order_lines
      WHERE ${woLineFkColumn} = $1
      ORDER BY created_at ASC
    `,
    [woId]
  );
  const idMap = new Map<string, string>();
  let sequence = 1;
  for (const row of sourceRows.rows as Array<Record<string, unknown>>) {
    const sourceId = String(row.line_id);
    const parentMapped = row.parent_line_uuid ? idMap.get(String(row.parent_line_uuid)) ?? null : null;
    const ins = await client.query(
      `
        INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, section, parent_line_uuid, linked_wo_line_uuid)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `,
      [billId, sequence++, Number(row.line_total ?? 0), String(row.description ?? ""), String(row.section ?? "B"), parentMapped, sourceId]
    );
    idMap.set(sourceId, String(ins.rows[0]?.id ?? ""));
  }

  const counts = await client.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE section = 'A') AS a_count,
        COUNT(*) FILTER (WHERE section = 'B' AND parent_line_uuid IS NULL) AS b_parent_count,
        COUNT(*) FILTER (WHERE section = 'B' AND parent_line_uuid IS NOT NULL) AS b_sub_count,
        COUNT(*) FILTER (WHERE linked_wo_line_uuid IS NOT NULL) AS linked_count
      FROM accounting.bill_lines
      WHERE bill_id = $1
    `,
    [billId]
  );
  const row = counts.rows[0] as { a_count: number; b_parent_count: number; b_sub_count: number; linked_count: number };
  if (Number(row.a_count) !== 2) throw new Error(`expected 2 section A rows, got ${row.a_count}`);
  if (Number(row.b_parent_count) !== 2) throw new Error(`expected 2 section B parent rows, got ${row.b_parent_count}`);
  if (Number(row.b_sub_count) !== 4) throw new Error(`expected 4 section B sub rows, got ${row.b_sub_count}`);
  if (Number(row.linked_count) !== 8) throw new Error(`expected 8 linked rows, got ${row.linked_count}`);

  await client.query("ROLLBACK");
  console.log("PASS: db-verify-wo-bill-auto-create");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`FAIL: db-verify-wo-bill-auto-create -> ${String((error as Error).message || error)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
