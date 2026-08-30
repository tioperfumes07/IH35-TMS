/**
 * SCENARIO CERTIFIER — the single implementation (spec §4, GAP-D).
 *
 * `audit.scenario_status` had zero rows and zero callers: the table and its SECURITY DEFINER writer
 * shipped and nothing ever wrote to them, so every dot was capped below `passed` regardless of the
 * data. The previous answer to that was a committed snapshot (`program-scoreboard.json`) which kept
 * reporting green long after the truth moved. This certifies from live evidence instead.
 *
 * ONE implementation, two entry points: the in-process cron (scenario-certify.cron.ts) and the manual /
 * CI script (scripts/scenario-certify.mjs, which imports the compiled build). Render cron *services*
 * were never provisioned in this repo — crons run in-process — so the cron is the real schedule and the
 * script is for on-demand runs.
 */
import { SCENARIO_REGISTRY } from "./scenario-registry.js";
import { runScenarioProbe } from "./scenario-probe.service.js";

type CertifyClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CertifySummary = {
  certified: number;
  passed: number;
  notYet: number;
  regressed: number;
  skipped: number;
  errors: string[];
};

/**
 * PROOF THAT THIS CONNECTION CAN SEE DATA — mandatory before any certification is written.
 *
 * Measured on prod while building this: with an identical bypass on one pooled client, some probes
 * returned real counts while others returned 0, and the pattern moved between runs. Under FORCED RLS a
 * `0` is therefore NOT evidence of absence — it can equally mean this connection is masked.
 *
 * A masked run would certify all 24 slices `built/go`: an authoritative, freshly-timestamped, entirely
 * red board over a working system, flipping previously-passed slices to `fix` as though they had
 * regressed. That is strictly worse than the stale snapshot this replaces. So a certifier that cannot
 * prove it can see must not write.
 */
export async function assertNotMasked(client: CertifyClient): Promise<{ who: string; companies: number }> {
  const res = await client.query<{ companies: number; accounts: number; who: string }>(
    `SELECT (SELECT count(*) FROM org.companies)::int  AS companies,
            (SELECT count(*) FROM catalogs.accounts)::int AS accounts,
            current_user AS who`
  );
  const row = res.rows[0];
  if (!row || !Number(row.companies) || !Number(row.accounts)) {
    throw new Error(
      `scenario-certify: RLS masking check FAILED (user=${row?.who}, companies=${row?.companies}, ` +
        `accounts=${row?.accounts}). Zero here means masked, not empty — certifying would write a false ` +
        `all-red board. Aborting without writing.`
    );
  }
  return { who: row.who, companies: Number(row.companies) };
}

async function priorStage(client: CertifyClient, key: string, entity: string | null): Promise<string | null> {
  const res = await client.query<{ stage: string }>(
    `SELECT stage::text AS stage
       FROM audit.scenario_status
      WHERE scenario_key = $1
        AND operating_company_id IS NOT DISTINCT FROM $2::uuid
        AND is_current = true
      LIMIT 1`,
    [key, entity]
  );
  return res.rows[0]?.stage ?? null;
}

/**
 * Certify every count-probed slice for every active entity plus a NULL-entity (all) pass.
 *
 * The caller supplies a client that is ALREADY bypass-scoped. Note the bypass must be session-scoped
 * and must NOT be accompanied by `app.operating_company_id`: setting that GUC alongside the bypass was
 * measured on prod to drop visibility back to zero. Entity scoping comes from each probe's $1.
 */
export async function certifyAllScenarios(client: CertifyClient): Promise<CertifySummary> {
  await assertNotMasked(client);

  const entities = await client.query<{ id: string; code: string }>(
    `SELECT id::text AS id, code FROM org.companies WHERE is_active IS DISTINCT FROM false ORDER BY code`
  );
  const scopes: Array<{ id: string | null; code: string }> = [{ id: null, code: "ALL" }, ...entities.rows];

  const summary: CertifySummary = { certified: 0, passed: 0, notYet: 0, regressed: 0, skipped: 0, errors: [] };

  for (const scope of scopes) {
    for (const def of SCENARIO_REGISTRY) {
      // hop.revenue's truth is a feature flag resolved through isEnabled(), not a row count. The read
      // path resolves it live; approximating it here would risk certifying a dot the poster would refuse.
      if (!def.probe) {
        summary.skipped += 1;
        continue;
      }
      try {
        const live = await runScenarioProbe(client, def, scope.id);
        if (!live) {
          summary.skipped += 1;
          continue;
        }
        const holds = live.ok;
        const evidence = live.evidence;

        let stage = "built";
        let state = "go";
        if (holds) {
          stage = "passed";
          state = "done";
          summary.passed += 1;
        } else {
          const before = await priorStage(client, def.key, scope.id);
          // A slice that HAD passed and no longer does is a regression, not a fresh not-yet. Flattening
          // the two would hide real breakage behind the same colour as never-built.
          if (before === "passed" || before === "complete") {
            state = "fix";
            summary.regressed += 1;
          } else {
            summary.notYet += 1;
          }
        }

        await client.query(`SELECT audit.set_scenario_status($1, $2::uuid, $3, $4, $5, $6, $7)`, [
          def.key,
          scope.id,
          stage,
          state,
          evidence,
          "CI-PROBE",
          // NEVER true. The read path ignores test certifications entirely, so a fixture cert here
          // would be a silent no-op at best and a lie at worst.
          false,
        ]);
        summary.certified += 1;
      } catch (error) {
        // One bad slice must not abort the sweep — the rest of the board still needs refreshing.
        summary.errors.push(`${def.key}@${scope.code}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return summary;
}
