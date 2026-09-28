#!/usr/bin/env node
// B3 (Devin sweep, 2026-09-28; migration 202614540000) -- mdata.workflow_requests had NO
// operating_company_id column at all, and its SELECT policy admitted ANY global Administrator
// ("identity.current_user_role() IN ('Owner','Administrator')" with no company predicate). An
// Administrator scoped to one company could enumerate and read every other company's workflow
// requests. Fixed: operating_company_id added (NOT NULL), backfilled from the target resource,
// RLS tightened to require org.user_accessible_company_ids() membership, route layer
// (workflow-routes.ts) adds the same scope explicitly.
//
// This guard proves the fix with REAL cross-tenant data, not a schema-shape check alone: it finds
// two real Administrators each scoped to exactly one, DIFFERENT company, inserts one synthetic
// workflow_request row per company inside a transaction, reads AS EACH Administrator (real
// app.current_user_id, no bypass) and asserts each sees their own company's row but NOT the
// other's, then ROLLS BACK -- no data persists, no fixture is left behind.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-workflow-requests-entity-scoped";
export const REQUIRES_LIVE_DB =
  "live-data security guard (mdata.workflow_requests cross-tenant RLS); fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

function selftest() {
  console.log(`${LABEL} selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // #1 -- schema shape: column exists, NOT NULL, RLS policies reference the real membership check.
    const colRes = await client.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema='mdata' AND table_name='workflow_requests' AND column_name='operating_company_id'`
    );
    if (!colRes.rows[0]) {
      failures.push("mdata.workflow_requests.operating_company_id column does not exist");
    } else if (colRes.rows[0].is_nullable !== "NO") {
      failures.push("mdata.workflow_requests.operating_company_id is nullable -- expected NOT NULL");
    }

    const polRes = await client.query(
      `SELECT polname, pg_get_expr(polqual, polrelid) AS qual FROM pg_policy WHERE polrelid = 'mdata.workflow_requests'::regclass`
    );
    for (const name of ["mdata_wf_select", "mdata_wf_update"]) {
      const pol = polRes.rows.find((r) => r.polname === name);
      if (!pol || !/user_accessible_company_ids/.test(pol.qual ?? "")) {
        failures.push(`policy ${name} does not reference org.user_accessible_company_ids() -- the real membership check`);
      }
    }

    // #2 -- find two real Administrators scoped to exactly one, different company each.
    const adminsRes = await client.query(
      `
        SELECT uca.user_id::text, array_agg(DISTINCT uca.company_id::text) AS companies
          FROM org.user_company_access uca
          JOIN identity.users u ON u.id = uca.user_id
         WHERE uca.deactivated_at IS NULL AND u.role = 'Administrator'
         GROUP BY uca.user_id
        HAVING count(DISTINCT uca.company_id) = 1
      `
    );
    const byCompany = new Map();
    for (const row of adminsRes.rows) {
      const co = row.companies[0];
      if (!byCompany.has(co)) byCompany.set(co, row.user_id);
    }
    const companies = [...byCompany.keys()];
    if (companies.length < 2) {
      failures.push(
        `could not find two Administrators scoped to two different single companies (found ${companies.length}) -- cannot run the real cross-tenant proof`
      );
    } else {
      const [coA, coB] = companies;
      const userA = byCompany.get(coA);
      const userB = byCompany.get(coB);

      // A driver row per company to attach the synthetic workflow_request to (required FK-ish
      // real target -- callerCanTargetResource's own resolution rule).
      const driverRes = await client.query(
        `SELECT DISTINCT ON (operating_company_id) id::text, operating_company_id::text FROM mdata.drivers WHERE operating_company_id = ANY($1::uuid[]) ORDER BY operating_company_id`,
        [[coA, coB]]
      );
      const driverByCompany = new Map(driverRes.rows.map((r) => [r.operating_company_id, r.id]));
      if (!driverByCompany.has(coA) || !driverByCompany.has(coB)) {
        failures.push("could not find a live driver row in each of the two test companies -- cannot construct a real synthetic workflow_request");
      } else {
        const insertedIds = [];
        for (const [co, driverId] of [
          [coA, driverByCompany.get(coA)],
          [coB, driverByCompany.get(coB)],
        ]) {
          const ins = await client.query(
            `
              INSERT INTO mdata.workflow_requests (action_code, requested_by, target_resource_type, target_resource_id, operating_company_id)
              VALUES ('WF-064-MDATA-001', $1::uuid, 'driver', $2::uuid, $3::uuid)
              RETURNING id::text
            `,
            [byCompany.get(co), driverId, co]
          );
          insertedIds.push(ins.rows[0].id);
        }
        const [idA, idB] = insertedIds;

        // #3 -- read AS Administrator A (real session, no bypass): must see A's row, must NOT see B's.
        for (const [label, userId, ownId, otherId] of [
          ["A", userA, idA, idB],
          ["B", userB, idB, idA],
        ]) {
          await client.query(`SELECT set_config('app.bypass_rls', '', true)`);
          await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [userId]);
          const visible = await client.query(
            `SELECT id::text FROM mdata.workflow_requests WHERE id = ANY($1::uuid[])`,
            [[idA, idB]]
          );
          const visibleIds = new Set(visible.rows.map((r) => r.id));
          if (!visibleIds.has(ownId)) {
            failures.push(`Administrator ${label} could NOT see their own company's synthetic workflow_request -- RLS is over-restrictive`);
          }
          if (visibleIds.has(otherId)) {
            failures.push(`Administrator ${label} COULD see the OTHER company's synthetic workflow_request -- the cross-tenant leak is NOT fixed`);
          }
          await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        }
      }
    }

    await client.query("ROLLBACK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — schema shape correct, RLS policies reference real membership, and two real Administrators in two different companies each see only their own company's workflow_request (rolled back, no data persisted).`);
}

main();
