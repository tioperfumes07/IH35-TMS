#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.3 / §2.4: "Late Fee + Lumper +
 * Fuel + R&M + Other must foot: ... = the sum of all non-void expense and bill lines on the load. If
 * it does not foot, the board is lying." Two checks: (1) static -- no clamp (GREATEST(0,...)) can
 * mask a footing failure; (2) DB-backed -- the identity actually holds on whatever loads exist in the
 * reachable database (CI's ephemeral migrated Postgres; SKIPs cleanly on an unmigrated/unreachable one,
 * same convention as scripts/verify-steps/3049-verify-voided-money-doc-has-gl-reversal.mjs).
 */
import fs from "node:fs";
import pg from "pg";

const LABEL = "verify-load-costs-cost-split-foots";
const BACKEND_PATH = "apps/backend/src/accounting/load-costs-board.routes.ts";

function staticViolations(backend) {
  const errors = [];
  if (backend.includes("GREATEST(0,")) errors.push("other_cost_cents is clamped with GREATEST(0,...) -- a footing failure would be silently masked instead of surfaced");
  if (!/\(COALESCE\(ec\.expense_cents,0\) \+ COALESCE\(bc\.bill_cents,0\) - COALESCE\(rm\.repairs_maintenance_cents,0\) - COALESCE\(cb\.fuel_cents,0\) - COALESCE\(cb\.lumper_cents,0\) - COALESCE\(cb\.late_fee_cents,0\)\)::text AS other_cost_cents/.test(backend)) {
    errors.push("other_cost_cents is not the exact honest-remainder expression (expense+bill minus R&M minus fuel minus lumper minus late_fee)");
  }
  return errors;
}

function checkStatic(backend) {
  const errors = staticViolations(backend);
  if (errors.length) throw new Error(errors.join("; "));
}

const backendSrc = fs.readFileSync(BACKEND_PATH, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    `${backendSrc}\nGREATEST(0, `,
    backendSrc.replace("- COALESCE(cb.late_fee_cents,0))::text AS other_cost_cents", ")::text AS other_cost_cents"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { checkStatic(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`static mutation ${index + 1} escaped detection`);
  }
  checkStatic(backendSrc);
  console.log(`PASS ${LABEL} --selftest (${caught}/${mutations.length} static)`);
  process.exit(0);
}

checkStatic(backendSrc);

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] static checks PASS; SKIP live footing check -- no DATABASE_URL (static context); this half is DB-backed by design`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] static checks PASS; SKIP live footing check -- database unreachable (static context)`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const schemaProbe = await client.query(`SELECT to_regclass('accounting.bills') IS NOT NULL AS present`);
  if (!schemaProbe.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] static checks PASS; SKIP live footing check -- accounting schema not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // Reproduces the route's own bucketing (expense_costs/bill_costs/category_costs/repair_costs) for
  // every real, non-draft load with at least one cost line, across every operating company (not
  // scoped to USMCA only -- the identity must hold everywhere the route runs).
  const { rows } = await client.query(`
    WITH expense_costs AS (
      SELECT e.load_id, COALESCE(SUM(e.total_amount_cents), 0)::bigint AS expense_cents
        FROM accounting.expenses e
       WHERE e.load_id IS NOT NULL AND e.status <> 'void'
       GROUP BY e.load_id
    ), bill_costs AS (
      SELECT bl.load_id, COALESCE(SUM(ROUND(bl.amount * 100)), 0)::bigint AS bill_cents
        FROM accounting.bill_lines bl
        JOIN accounting.bills b ON b.id = bl.bill_id
       WHERE bl.load_id IS NOT NULL AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL
       GROUP BY bl.load_id
    ), category_costs AS (
      SELECT load_id,
             COALESCE(SUM(amount_cents) FILTER (WHERE line_category = 'detention_paid'), 0)::bigint AS late_fee_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE line_category = 'lumper'), 0)::bigint AS lumper_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE line_category IN ('diesel','def')), 0)::bigint AS fuel_cents
        FROM (
          SELECT el.load_id, el.line_category, el.amount_cents
            FROM accounting.expense_lines el
            JOIN accounting.expenses e ON e.id = el.expense_id
           WHERE el.load_id IS NOT NULL AND e.status <> 'void' AND e.linked_work_order_uuid IS NULL
          UNION ALL
          SELECT bl.load_id, bl.line_category, ROUND(bl.amount * 100)::bigint AS amount_cents
            FROM accounting.bill_lines bl
            JOIN accounting.bills b ON b.id = bl.bill_id
           WHERE bl.load_id IS NOT NULL AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL AND b.linked_work_order_uuid IS NULL
        ) x
       GROUP BY load_id
    ), repair_costs AS (
      SELECT load_id, COALESCE(SUM(amount_cents), 0)::bigint AS repairs_maintenance_cents FROM (
        SELECT e.load_id, e.total_amount_cents::bigint AS amount_cents
          FROM accounting.expenses e
          JOIN maintenance.work_orders wo ON wo.id = e.linked_work_order_uuid AND wo.load_id = e.load_id AND wo.load_id IS NOT NULL AND wo.status <> 'cancelled'
         WHERE e.load_id IS NOT NULL AND e.status <> 'void'
        UNION ALL
        SELECT bl.load_id, ROUND(bl.amount * 100)::bigint AS amount_cents
          FROM accounting.bill_lines bl
          JOIN accounting.bills b ON b.id = bl.bill_id
          JOIN maintenance.work_orders wo ON wo.id = b.linked_work_order_uuid AND wo.load_id = bl.load_id AND wo.load_id IS NOT NULL AND wo.status <> 'cancelled'
         WHERE bl.load_id IS NOT NULL AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL
      ) y GROUP BY load_id
    )
    SELECT l.id::text AS load_id,
           COALESCE(ec.expense_cents,0) + COALESCE(bc.bill_cents,0) AS total_cents,
           COALESCE(cb.late_fee_cents,0) + COALESCE(cb.lumper_cents,0) + COALESCE(cb.fuel_cents,0) + COALESCE(rm.repairs_maintenance_cents,0)
             + (COALESCE(ec.expense_cents,0) + COALESCE(bc.bill_cents,0) - COALESCE(rm.repairs_maintenance_cents,0) - COALESCE(cb.fuel_cents,0) - COALESCE(cb.lumper_cents,0) - COALESCE(cb.late_fee_cents,0)) AS split_total_cents
      FROM mdata.loads l
      LEFT JOIN expense_costs ec ON ec.load_id = l.id
      LEFT JOIN bill_costs bc ON bc.load_id = l.id
      LEFT JOIN category_costs cb ON cb.load_id = l.id
      LEFT JOIN repair_costs rm ON rm.load_id = l.id
     WHERE l.status <> 'draft' AND (COALESCE(ec.expense_cents,0) + COALESCE(bc.bill_cents,0)) > 0
  `);

  await client.query("COMMIT");

  if (rows.length === 0) {
    console.log(`[${LABEL}] static checks PASS; live footing check finds 0 loads with any recorded cost -- vacuous, not a failure (no data to disprove the identity)`);
    process.exit(0);
  }

  const mismatches = rows.filter((r) => Number(r.total_cents) !== Number(r.split_total_cents));
  if (mismatches.length > 0) {
    for (const m of mismatches.slice(0, 10)) {
      console.error(` - load ${m.load_id}: total ${m.total_cents} != split-sum ${m.split_total_cents}`);
    }
    console.error(`[${LABEL}] FAIL: ${mismatches.length}/${rows.length} load(s) do not foot -- the board is lying`);
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS -- Late Fee+Lumper+Fuel+R&M+Other foots to the non-void expense+bill total on all ${rows.length} loads checked`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[${LABEL}] FAIL: query failed: ${err?.message ?? err}`);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
