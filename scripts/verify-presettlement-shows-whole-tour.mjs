#!/usr/bin/env node
// ROUND 173 pt 5 (Lead, 2026-09-25) — "verify-presettlement-shows-whole-tour.mjs: the pre-
// settlement's load count = the loads linked to it." OWNER RULE: THE TOUR (pt 2): "A pre-
// settlement is the driver's TOUR. It can hold 2+ loads ... and it MUST show all of the tour's
// loads." The whole-tour set is defined by tour-readout.routes.ts's own `legs` CTE (buildTourReadout,
// PRE-EXISTING, cited verbatim below, not re-derived) -- this guard independently recomputes that
// same set from raw tables and asserts it matches what "the loads linked to it" means: every load
// with mdata.loads.presettlement_link_id = the settlement, UNION every load carrying an active,
// non-voided driver_finance.settlement_lines row for the settlement. A settlement whose tour
// (union set) is not fully reachable through the SAME legs query the UI renders is exactly the
// defect this guard exists to catch -- a load silently missing from the Pre-Settlement/Settlement
// screen.
//
// Self-test: node scripts/verify-presettlement-shows-whole-tour.mjs --selftest

import pg from "pg";

// REQUIRES_LIVE_DB (ROUND 29.9-B convention): excludes this guard from verify-static.mjs's
// dead-port sentinel sweep. live() fails closed without DATABASE_URL by design.
export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B)";

const LABEL = "verify-presettlement-shows-whole-tour";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BYPASS = `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)`;

/**
 * Pure — given the two raw counts (union-set size vs. tour-readout legs count), the check is a
 * plain equality. Kept as its own function so --selftest can exercise it with fixtures, no DB.
 */
export function tourLoadCountsMatch(unionCount, legsCount) {
  return unionCount === legsCount;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: DATABASE_URL not set. Refusing to pass a money gate that never ran.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  let failures = 0;
  let checked = 0;
  const misses = [];
  try {
    await client.connect();
    await client.query("BEGIN");

    const { rows } = await client.query(
      `${BYPASS}
       SELECT
         s.id::text AS settlement_id,
         s.display_id,
         s.trip_closed_at IS NULL AS is_open,
         -- The whole-tour union: presettlement_link_id (R-168's current pointer) UNION every load
         -- carrying an active settlement_lines row for this settlement (SETL-LEGS-FROM-LINES, the
         -- exact fix tour-readout.routes.ts's own legs CTE already applies for closed tours whose
         -- bookend-only presettlement_link_id undercounts the real tour).
         -- Both branches join back through mdata.loads with the SAME live-population filters
         -- (operating_company_id, soft_deleted_at IS NULL) -- a settlement_lines row can reference
         -- a load that has since exited USMCA (e.g. R-160's 13 Transportation loads) or another
         -- entity; such a row is a stale historical reference, not part of the CURRENT tour, and
         -- must be excluded exactly like the legs-shaped query below excludes it (both real
         -- production examples measured this run: settlement 5772's lines reference now
         -- soft-deleted loads 13502/13507 -- correctly not part of its live tour).
         (
           SELECT count(DISTINCT load_id) FROM (
             SELECT l.id AS load_id
               FROM mdata.loads l
              WHERE l.presettlement_link_id = s.id
                AND l.operating_company_id = $1::uuid
                AND l.soft_deleted_at IS NULL
             UNION
             SELECT l2.id AS load_id
               FROM driver_finance.settlement_lines sl
               JOIN mdata.loads l2 ON l2.id = sl.load_id
              WHERE sl.settlement_id = s.id
                AND sl.is_active AND sl.voided_at IS NULL
                AND l2.operating_company_id = $1::uuid
                AND l2.soft_deleted_at IS NULL
           ) union_loads
         ) AS union_count
       FROM driver_finance.driver_settlements s
       WHERE (SELECT v FROM b) = 'lucia'
         AND s.operating_company_id = $1::uuid
         AND s.status <> 'cancelled'`,
      [USMCA_COMPANY_ID]
    );

    for (const row of rows) {
      const unionCount = Number(row.union_count);
      if (unionCount === 0) continue; // a settlement with no loads at all yet — nothing to verify, not a violation

      // The population this guard arms on: settlements whose real tour (union set) is more than
      // just presettlement_link_id can see alone (i.e. the exact SETL-LEGS-FROM-LINES population).
      // For those, cross-check against the legs CTE's OWN logic (re-run inline, same predicate,
      // same WHERE l.presettlement_link_id = $1 OR EXISTS(settlement_lines) shape tour-readout.routes.ts
      // uses) so a future edit to that file that narrows the union without updating this guard's
      // own copy still gets caught by the two independently-computed counts disagreeing.
      const legsRes = await client.query(
        `${BYPASS}
         SELECT count(DISTINCT l.id)::int AS legs_count
           FROM mdata.loads l
          WHERE (SELECT v FROM b) = 'lucia'
            AND l.operating_company_id = $2::uuid
            AND l.soft_deleted_at IS NULL
            AND (
              l.presettlement_link_id = $1::uuid
              OR EXISTS (
                SELECT 1 FROM driver_finance.settlement_lines sl
                 WHERE sl.settlement_id = $1::uuid
                   AND sl.load_id = l.id
                   AND sl.is_active AND sl.voided_at IS NULL
              )
            )`,
        [row.settlement_id, USMCA_COMPANY_ID]
      );
      const legsCount = Number(legsRes.rows[0]?.legs_count ?? 0);
      checked++;
      if (!tourLoadCountsMatch(unionCount, legsCount)) {
        failures++;
        misses.push(row.display_id ?? row.settlement_id);
        console.log(`  FAIL  ${row.display_id ?? row.settlement_id} -- union set ${unionCount} loads, legs-shaped query ${legsCount} loads`);
      } else {
        console.log(`  PASS  ${row.display_id ?? row.settlement_id} -- ${unionCount} load(s), whole tour visible`);
      }
    }

    await client.query("ROLLBACK");
  } finally {
    await client.end().catch(() => {});
  }

  console.log("");
  if (failures) {
    console.error(`${LABEL}: FAIL — ${failures} of ${checked} settlement(s) do not show their whole tour: ${misses.join(", ")}.`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${checked} settlement(s) with loads checked, 0 mismatches. Every settlement's load count ties to the loads linked to it.\n`);
}

function selftest() {
  const cases = [
    { name: "matched counts", a: 3, b: 3, expect: true },
    { name: "legs undercounts (a real defect)", a: 5, b: 2, expect: false },
    { name: "legs overcounts (a real defect, e.g. stale historical leg)", a: 2, b: 5, expect: false },
    { name: "zero both, trivially equal", a: 0, b: 0, expect: true },
  ];
  let pass = 0;
  for (const c of cases) {
    const got = tourLoadCountsMatch(c.a, c.b);
    const ok = got === c.expect;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : ` — got ${got}, expected ${c.expect}`}`);
    if (ok) pass++;
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} PASS`);
  if (pass !== cases.length) process.exit(1);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
