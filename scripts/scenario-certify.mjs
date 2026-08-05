#!/usr/bin/env node
/**
 * SCENARIO CERTIFIER — the job that makes the tracker self-running (spec §4, GAP-D).
 *
 * WHY THIS EXISTS
 * `audit.scenario_status` had ZERO rows and zero callers: the table and its SECURITY DEFINER writer
 * shipped, and nothing ever wrote to them. So every dot was capped below "passed" no matter what the
 * data said. The old answer to that was `docs/audit/program-scoreboard.json` — a committed snapshot,
 * generated once, that kept reporting green long after the truth moved. This job is the replacement:
 * certifications are MEASURED from prod on a schedule, never typed by a human.
 *
 * WHAT IT DOES, EVERY RUN
 *   entity list = active org.companies, plus one NULL-entity pass for the all-entities view
 *   for each (slice × entity): evaluate the SAME shared probe the read path uses, then
 *     holds  -> set_scenario_status(key, entity, 'passed', 'done', <measured count>, 'CI-PROBE', false)
 *     absent -> set_scenario_status(key, entity, 'built',  'go'|'fix', <why>,        'CI-PROBE', false)
 *   'fix' rather than 'go' when the slice was previously certified passed — a regression reads
 *   differently from something that never worked, and flattening the two hides real breakage.
 *
 * THE SAFETY PROPERTY
 * A stale cert can never show false green, because the read path RE-EVALUATES the predicate at request
 * time and downgrades the dot itself. This job's cadence therefore affects freshness, not correctness —
 * which is exactly why it is safe to run it unattended.
 *
 * NEVER is_test_data=true. A fixture certification must not be able to move a real dot; the read path
 * ignores test certs entirely, so writing one here would be a silent no-op at best and a lie at worst.
 *
 * READ-ONLY against business data — its only write is the audit certification row.
 */
import pg from "pg";
import { pathToFileURL } from "node:url";

const DATABASE_URL = process.env.DATABASE_URL;

/** Load the registry from the compiled backend so the SQL is literally the same text. */
async function loadRegistry() {
  const candidates = [
    "../apps/backend/dist/home/scenario-registry.js",
    "../apps/backend/src/home/scenario-registry.ts",
  ];
  for (const rel of candidates) {
    try {
      const url = pathToFileURL(new URL(rel, import.meta.url).pathname).href;
      const mod = await import(url);
      if (mod?.SCENARIO_REGISTRY?.length) return mod;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    "scenario-certify: could not load SCENARIO_REGISTRY. Build the backend first (npm run build -w apps/backend) " +
      "so dist/home/scenario-registry.js exists. Refusing to certify from a hand-written copy of the predicates."
  );
}

async function activeEntities(client) {
  const res = await client.query(
    `SELECT id::text AS id, code FROM org.companies WHERE is_active IS DISTINCT FROM false ORDER BY code`
  );
  return res.rows;
}

/** Prior certification, so a regression can be reported as 'fix' rather than a fresh 'go'. */
async function priorStage(client, key, entity) {
  const res = await client.query(
    `
      SELECT stage::text AS stage
        FROM audit.scenario_status
       WHERE scenario_key = $1
         AND operating_company_id IS NOT DISTINCT FROM $2::uuid
         AND is_current = true
       LIMIT 1
    `,
    [key, entity]
  );
  return res.rows[0]?.stage ?? null;
}

/**
 * PROOF THAT THIS CONNECTION CAN SEE DATA — run before certifying anything.
 *
 * Measured on prod while building this: with the identical bypass on one pooled client, some probes
 * returned real counts while others returned 0, and the pattern moved between runs. Under FORCED RLS a
 * `0` is therefore NOT evidence of "no data" — it can equally mean "this connection is masked".
 *
 * That distinction is the whole ballgame here. A masked connection would certify all 24 slices as
 * 'built/go' — writing an authoritative-looking, fully red board over a system that is actually
 * working, and (worse) flipping previously-passed slices to 'fix' as if they had regressed.
 *
 * So: assert a control that MUST be non-zero, and abort the whole run if it is not. A certifier that
 * cannot prove it can see is a certifier that must not write.
 */
async function assertNotMasked(client) {
  const control = await client.query(
    `SELECT (SELECT count(*) FROM org.companies)::int AS companies,
            (SELECT count(*) FROM catalogs.accounts)::int AS accounts,
            current_user AS who`
  );
  const row = control.rows[0] ?? {};
  if (!Number(row.companies) || !Number(row.accounts)) {
    throw new Error(
      `scenario-certify: RLS masking check FAILED (current_user=${row.who}, companies=${row.companies}, ` +
        `accounts=${row.accounts}). A zero here means this connection cannot see data, not that the data ` +
        `is absent — certifying now would write a false all-red board. Aborting without writing.`
    );
  }
  return row;
}

/**
 * Delegates to the compiled backend service so the cron and this script run the SAME code. An earlier
 * draft of this file reimplemented the loop; two copies of a certifier is how a board starts disagreeing
 * with itself depending on which entry point last ran.
 */
export async function certifyOnce(client, registry) {
  const mod = await import(
    new URL("../apps/backend/dist/home/scenario-certify.service.js", import.meta.url).href
  );
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  return mod.certifyAllScenarios(client);
}

async function main() {
  if (!DATABASE_URL) {
    console.error("scenario-certify: DATABASE_URL is required.");
    process.exit(2);
  }
  const registry = await loadRegistry();
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const s = await certifyOnce(client, registry);
    console.log(
      `scenario-certify: ${s.certified} certification(s) written — ${s.passed} passed, ${s.notYet} not-yet, ` +
        `${s.regressed} regressed, ${s.skipped} skipped (no count probe).`
    );
    for (const e of s.errors) console.error(`  ! ${e}`);
    process.exit(s.errors.length ? 1 : 0);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
