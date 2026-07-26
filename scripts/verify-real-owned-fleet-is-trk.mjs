#!/usr/bin/env node
/**
 * verify-real-owned-fleet-is-trk (FLT-02)
 *
 * THE DEFECT THIS PINS. The real fleet was owned by the wrong entity. TRK is the ASSET HOLDER (it owns
 * the trucks); TRANSP is the OPERATING CARRIER (it runs them under lease). Every real unit must be
 * `owner_company_id = TRK` with `currently_leased_to_company_id = TRANSP`. `mdata.units` has NO
 * operating_company_id — those two columns ARE its entity scoping, which is exactly why getting them
 * wrong is invisible until a report, a lease schedule or a depreciation register reads the fleet and
 * attributes assets to the entity that does not own them.
 *
 * TWO LAYERS, because a static check alone cannot see prod and a live check alone cannot run in CI:
 *
 *   STATIC (always): the FLT-02 data-fix migration exists and still encodes the invariant — the
 *   ownership correction cannot be quietly deleted from the repo, so a fresh DB always reaches the
 *   same state.
 *
 *   LIVE (degrade-safe, only with DATABASE_URL): 0 non-sample units are owned by anything other than
 *   TRK. Runs with app.bypass_rls='lucia' AND a POSITIVE CONTROL first — mdata.* is FORCED-RLS and a
 *   raw session reads 0 rows, so an un-controlled "0 violations" here would be the false-empty trap
 *   reporting success for a query that saw nothing at all.
 *
 * DELIBERATELY NOT ASSERTED: that USMCA owns no units. Prod has 93 USMCA-owned units and all 93 are
 * is_sample_data=true — that is FIXTURE POLLUTION (FLT-03/FLT-07), not an isolation breach. Asserting
 * "USMCA owns nothing" would go red on fixtures and pressure someone into re-homing or deleting them,
 * destroying the evidence that they are fixtures.
 *
 * Usage: node scripts/verify-real-owned-fleet-is-trk.mjs [--selftest]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const MIGRATION_MATCH = /flt_02_real_fleet_owned_by_trk\.sql$/;

/** STATIC: the migration must exist and still carry the ownership correction. */
export function assertMigrationEncodesInvariant(sql) {
  const problems = [];
  if (!/owner_company_id\s*=\s*v_trk/i.test(sql)) {
    problems.push("the FLT-02 migration no longer sets owner_company_id to the TRK id");
  }
  if (!/currently_leased_to_company_id\s*=\s*v_transp/i.test(sql)) {
    problems.push("the FLT-02 migration no longer sets currently_leased_to_company_id to the TRANSP id");
  }
  if (!/is_sample_data/i.test(sql)) {
    problems.push("the FLT-02 migration no longer EXCLUDES fixtures — it would re-home sample units and destroy FLT-03/FLT-07 evidence");
  }
  if (/DELETE\s+FROM|TRUNCATE/i.test(sql)) {
    problems.push("the FLT-02 migration contains a DELETE/TRUNCATE — this is an ownership correction, it must never destroy rows (owner ruling F9)");
  }
  return problems;
}

function findMigration() {
  const dir = resolve(process.cwd(), MIGRATIONS_DIR);
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => MIGRATION_MATCH.test(n));
  return f ? join(dir, f) : null;
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("  live: SKIP — no DATABASE_URL (degrade-safe)");
    return [];
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (err) {
    // `verify:static` deliberately runs the whole suite against a DEAD-PORT SENTINEL DATABASE_URL
    // (127.0.0.1:59999) so no guard can reach a real database, least of all prod. A set-but-
    // unreachable URL is therefore the NORMAL CI-static condition, not a failure — degrade to skip,
    // exactly as an absent URL does. Failing here would make the static suite red on every branch
    // and the usual "fix" would be to delete the live layer, losing the only check that can see prod.
    console.log(`  live: SKIP — DATABASE_URL set but unreachable (${err.code ?? err.message}) — dead-port sentinel / no DB in this context`);
    return [];
  }
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // POSITIVE CONTROL — mdata.* is FORCED-RLS; without this a masked read reports a false clean bill.
    const pc = await client.query("SELECT count(*)::int AS n FROM mdata.units");
    if (!pc.rows[0].n) {
      return ["positive control saw 0 units — RLS masking; a '0 violations' result here would be a FALSE EMPTY, not a pass"];
    }

    const bad = await client.query(`
      SELECT count(*)::int AS n
        FROM mdata.units u
        LEFT JOIN org.companies o ON o.id = u.owner_company_id
       WHERE COALESCE(u.is_sample_data, false) = false
         AND COALESCE(o.code, '-') <> 'TRK'
    `);
    console.log(`  live: ${pc.rows[0].n} units visible; ${bad.rows[0].n} real unit(s) not owned by TRK`);
    return bad.rows[0].n > 0
      ? [`${bad.rows[0].n} real (non-sample) unit(s) are NOT owned by TRK — the asset holder must own every real unit (FLT-02)`]
      : [];
  } finally {
    await client.end();
  }
}

function selftest() {
  const path = findMigration();
  if (!path) {
    console.error("SELFTEST FAIL: FLT-02 migration not found — the static layer cannot be exercised");
    process.exit(1);
  }
  const real = readFileSync(path, "utf8");
  let ok = true;

  if (assertMigrationEncodesInvariant(real).length) {
    console.error("SELFTEST FAIL: the real migration is flagged by its own assertions (false positive)");
    ok = false;
  } else {
    console.log("SELFTEST: corrected shape not flagged — OK");
  }

  const mutations = [
    ["owner", real.replace(/owner_company_id\s*=\s*v_trk/i, "owner_company_id = v_transp")],
    ["lease", real.replace(/currently_leased_to_company_id\s*=\s*v_transp/i, "currently_leased_to_company_id = NULL")],
    ["fixtures", real.replace(/is_sample_data/gi, "true_flag")],
    ["destructive", `${real}\nDELETE FROM mdata.units WHERE 1=0;\n`],
  ];
  for (const [name, mutated] of mutations) {
    if (mutated === real) {
      console.error(`SELFTEST FAIL: mutation '${name}' was INERT — it proves nothing`);
      ok = false;
      continue;
    }
    if (!assertMigrationEncodesInvariant(mutated).length) {
      console.error(`SELFTEST FAIL: mutation '${name}' was NOT caught`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' correctly caught`);
    }
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const path = findMigration();
  const problems = [];
  if (!path) {
    problems.push(`no FLT-02 migration found in ${MIGRATIONS_DIR} — the ownership correction must stay in the repo so a fresh DB reaches the same state`);
  } else {
    problems.push(...assertMigrationEncodesInvariant(readFileSync(path, "utf8")));
  }
  problems.push(...(await liveCheck()));

  if (problems.length) {
    console.error(`[verify-real-owned-fleet-is-trk] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log("[verify-real-owned-fleet-is-trk] OK — FLT-02 migration intact (TRK owns, TRANSP leases, fixtures excluded, nothing destroyed)");
}
