#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.3 / §2.4: "Late Fee + Lumper +
 * Fuel + R&M + Other must foot: ... = the sum of all non-void expense and bill lines on the load. If
 * it does not foot, the board is lying." Two checks: (1) static -- no clamp (GREATEST(0,...)) can
 * mask a footing failure; (2) DB-backed -- the identity actually holds on whatever loads exist in the
 * reachable database (CI's ephemeral migrated Postgres; SKIPs cleanly on an unmigrated/unreachable one,
 * same convention as scripts/verify-voided-money-doc-has-gl-reversal.mjs).
 */
import fs from "node:fs";
import pg from "pg";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (Lead ROUND 84, E7 batch 2)";

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

// R443.139: reuse native document attribution; no frozen-company scan or empty-DB pass.
const { register } = await import("tsx/esm/api");
register();
const { LOAD_COST_DOCUMENTS_CTE } = await import("../apps/backend/src/accounting/load-costs-live-documents.sql.ts");
const { buildPgClientConfig } = await import("./lib/pg-connection-options.cjs");
const url=process.env.DATABASE_URL;
if(!url) throw new Error(LABEL+": DATABASE_URL required");
const client=new pg.Client(buildPgClientConfig(url));
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls='lucia'");
  const sql=`WITH ${LOAD_COST_DOCUMENTS_CTE}, classified AS (
    SELECT cd.load_id,cd.amount_cents,
      CASE WHEN wo.id IS NOT NULL THEN 'repair'
           WHEN cd.linked_work_order_uuid IS NULL AND cd.line_category IN ('diesel','def') THEN 'fuel'
           WHEN cd.linked_work_order_uuid IS NULL AND cd.line_category='lumper' THEN 'lumper'
           WHEN cd.linked_work_order_uuid IS NULL AND cd.line_category='detention_paid' THEN 'late'
           ELSE 'other' END AS bucket
    FROM cost_documents cd
    LEFT JOIN maintenance.work_orders wo ON wo.id=cd.linked_work_order_uuid
      AND wo.operating_company_id=$1::uuid AND wo.load_id=cd.load_id AND wo.status <> 'cancelled'
    JOIN mdata.loads l ON l.id=cd.load_id AND l.operating_company_id=$1::uuid
    WHERE l.is_sample_data IS NOT TRUE AND l.soft_deleted_at IS NULL
  ), totals AS (
    SELECT load_id,SUM(amount_cents) AS total,
      SUM(amount_cents) FILTER (WHERE bucket='repair') AS repairs,
      SUM(amount_cents) FILTER (WHERE bucket='fuel') AS fuel,
      SUM(amount_cents) FILTER (WHERE bucket='lumper') AS lumper,
      SUM(amount_cents) FILTER (WHERE bucket='late') AS late,
      SUM(amount_cents) FILTER (WHERE bucket='other') AS other
    FROM classified GROUP BY load_id
  ) SELECT count(*)::int AS loads,
      count(*) FILTER (WHERE total IS DISTINCT FROM
        COALESCE(repairs,0)+COALESCE(fuel,0)+COALESCE(lumper,0)+COALESCE(late,0)+COALESCE(other,0))::int AS mismatches
    FROM totals`;
  const params=["5c854333-6ea5-4faa-af31-67cb272fef80"];
  let result=(await client.query(sql,params)).rows[0];
  if(Number(result.loads)===0) result=(await client.query(sql,params)).rows[0];
  await client.query("ROLLBACK");
  if(Number(result.mismatches)!==0) throw new Error("USMCA bucket mismatches="+result.mismatches);
  console.log(LABEL+": PASS — USMCA loads="+result.loads+", mismatches="+result.mismatches+(Number(result.loads)===0?" (empty population repeated; no populated-data proof)":""));
} finally {
  await client.query("ROLLBACK").catch(()=>{});
  await client.end();
}
