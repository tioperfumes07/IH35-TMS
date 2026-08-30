/**
 * HOMEPAGE LIVE SCENARIO TRACKER §5 + §7 — live probes and the response assembler.
 *
 * THE ONE LAW: status is DERIVED at request time and never stored and read back. Every stage below
 * is a predicate evaluated against canonical prod tables on this call. There is no snapshot file in
 * this path — that is exactly the program-scoreboard.json failure being replaced.
 *
 * SELF-HEALING: Passed/Complete are gated by a LIVE DATA predicate in addition to the certification
 * row, so if the underlying artifact is deleted or regresses the dot downgrades on the next load.
 * Green cannot outlive the truth.
 */
import type { PoolClient } from "pg";
import {
  SCENARIO_REGISTRY,
  ALL_SOURCES,
  type ScenarioDefinition,
} from "./scenario-registry.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { runScenarioProbe } from "./scenario-probe.service.js";

export type ScenarioStage = "spec" | "built" | "merged" | "proof" | "passed" | "complete";
export type ScenarioState = "go" | "fix" | "done";

const STAGE_ORDER: ScenarioStage[] = ["spec", "built", "merged", "proof", "passed", "complete"];

export type ScenarioResult = {
  key: string;
  title: string;
  lane: string;
  stage: ScenarioStage;
  state: ScenarioState;
  evidence: string;
  je: string;
  je_contract: ScenarioDefinition["je_contract"] | null;
  spec_ref: string;
};

export type SourceHealth = { source: string; ok: boolean; probed_at_ct: string; detail?: string };

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** America/Chicago, formatted from the DB so CST/CDT is handled by the tz database, never an offset. */
export function centralTimeSql(): string {
  return `to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI:SS') || ' America/Chicago'`;
}

/** A relation exists on prod right now. Used for Merged and for source_health. */
async function relationPresent(client: QueryClient, rel: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean(res.rows[0]?.ok);
}

/**
 * Current certification row for a scenario, if any. NULL entity rows apply to every entity.
 *
 * Reads audit.scenario_status directly (is_current) rather than only the view, because the tracker
 * needs is_test_data: a GUARD-TEST or fixture certification must NEVER turn a real dot green. Test
 * certs are surfaced with their stage ignored — visible in evidence, powerless over the pipeline.
 * verified_by and verified_at travel with it so a green dot can always name who proved it and when.
 */
type CertRow = {
  stage: ScenarioStage;
  state: ScenarioState;
  evidence: string;
  is_current: boolean;
  is_test_data: boolean;
  verified_by: string;
  verified_at: string;
  /** True when THIS row was itself superseded — surfaced so a corrected cert is visible, not silent. */
  superseded: boolean;
};
async function currentCert(
  client: QueryClient,
  scenarioKey: string,
  entity: string | null
): Promise<CertRow | null> {
  const res = await client.query<CertRow>(
    `
      SELECT stage, state, evidence, is_current, is_test_data, verified_by,
             verified_at::text AS verified_at,
             (superseded_by IS NOT NULL) AS superseded
        FROM audit.scenario_status
       WHERE is_current
         AND scenario_key = $1
         -- #4469 — SCOPE. Asking for ONE entity may see that entity's cert or the ALL row (the
         -- fallback); asking for ALL must see ONLY the ALL row. The old predicate collapsed to
         -- "match anything" whenever $2 was NULL, so an ALL-scope read swept in every entity's
         -- rows and one entity's certification was reported as the programme-wide state.
         AND (CASE WHEN $2::uuid IS NULL
                   THEN operating_company_id IS NULL
                   ELSE (operating_company_id = $2::uuid OR operating_company_id IS NULL)
              END)
       -- #4469 — PRECEDENCE, and it must be deterministic. Both rows are legitimately eligible for
       -- an entity read, and the certifier stamps verified_at from the same clock, so identical
       -- timestamps are the NORM, not an edge case. Ordering by verified_at alone then left the
       -- winner to whatever the planner returned first, and the ALL row won often enough that USMCA
       -- certs were being credited to TRANSP across all 23 keys.
       --   0 = this entity's own cert   (most specific — always wins)
       --   1 = the ALL/NULL row         (the intended fallback)
       --   2 = some other entity's row  (unreachable via the WHERE above; ranked last so that if the
       --                                 predicate is ever loosened again this cannot silently win)
       -- id DESC is the final tiebreak so two rows identical in scope AND timestamp still resolve to
       -- one stable answer rather than a coin flip between board loads.
       ORDER BY CASE
                  WHEN $2::uuid IS NOT NULL AND operating_company_id = $2::uuid THEN 0
                  WHEN operating_company_id IS NULL THEN 1
                  ELSE 2
                END,
                verified_at DESC,
                id DESC
       LIMIT 1
    `,
    [scenarioKey, entity]
  );
  return res.rows[0] ?? null;
}

/**
 * The LIVE data predicate per hop — what must be true in the data for "Passed" to survive.
 * Returns null when the hop has no data predicate yet (then Passed cannot be reached on data alone).
 */
/**
 * The live predicate for one slice.
 *
 * Count-based slices delegate to the SHARED probe carried on the registry definition, so the certifier
 * (scripts/scenario-certify.mjs) and this read path execute byte-identical SQL. Keeping two copies is
 * how a board starts claiming green from a query nobody re-reads — the exact stale-snapshot failure
 * this tracker replaces.
 *
 * hop.revenue is the only hand-implemented case: its truth is a feature flag, not a row count, and it
 * must be read through isEnabled() so the per-entity override, the user override and the posting-OFF
 * short-circuit all apply. A raw SELECT on the overrides table would light a dot green for a flag the
 * poster would still refuse to honour.
 *
 * Returns null when a slice has no live predicate at all — the caller caps that at "merged" rather
 * than letting a certification alone paint it green.
 */
export async function livePassedPredicate(
  client: QueryClient,
  def: ScenarioDefinition,
  entity: string | null
): Promise<{ ok: boolean; evidence: string } | null> {
  if (def.key === "hop.revenue") {
    const enabled = entity
      ? await isEnabled(client as never, "REVENUE_RECOGNITION_POST_ENABLED", {
          operating_company_id: entity,
        })
      : false;
    return {
      ok: enabled,
      evidence: entity
        ? enabled
          ? "REVENUE_RECOGNITION_POST_ENABLED is ON for this entity"
          : "REVENUE_RECOGNITION_POST_ENABLED is OFF for this entity"
        : "per-entity flag — select an entity to resolve",
    };
  }

  return runScenarioProbe(client, def, entity);
}

/** Merged = the primitive this hop needs actually exists on prod right now. */
async function mergedPredicate(client: QueryClient, def: ScenarioDefinition): Promise<boolean> {
  for (const src of def.sources) {
    if (!(await relationPresent(client, src))) return false;
  }
  return true;
}

function maxStage(a: ScenarioStage, b: ScenarioStage): ScenarioStage {
  return STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}

/** Run one scenario's probe: the HIGHEST stage whose predicate is true right now. */
export async function probeScenario(
  client: QueryClient,
  def: ScenarioDefinition,
  entity: string | null
): Promise<ScenarioResult> {
  let stage: ScenarioStage = "spec"; // registry membership — always true
  let state: ScenarioState = "go";
  const notes: string[] = [];

  const merged = await mergedPredicate(client, def);
  if (merged) {
    stage = maxStage(stage, "merged");
    notes.push("primitives present on prod");
  } else {
    notes.push("primitive missing on prod");
  }

  const cert = await currentCert(client, def.key, entity);
  const live = await livePassedPredicate(client, def, entity);
  if (live) notes.push(live.evidence);

  if (cert && cert.is_test_data) {
    // A test/fixture certification is recorded for traceability but may not move a dot.
    notes.push(`test cert ignored (${cert.verified_by} @ ${cert.verified_at}): ${cert.evidence}`);
  } else if (cert) {
    state = cert.state;
    if (def.je_contract && cert.state === "done") {
      state = "fix";
      notes.push("done withheld: posting scenarios require JE account_role match, not join n>0");
    }
    // Proof is honoured from the cert row alone.
    // 'fix' is a STATE, not a stage — a scenario in fix still sits at whatever stage it reached.
    if (cert.stage === "proof" || cert.state === "fix") stage = maxStage(stage, "proof");

    // Passed/Complete REQUIRE the live predicate to still hold — this is the self-healing rule.
    if ((cert.stage === "passed" || cert.stage === "complete") && live?.ok) {
      if (def.je_contract) {
        notes.push(
          "JE contract registered (account_role, not n>0). Live code match is verify-posting-hits-designed-accounts — join-only is not done"
        );
      }
      stage = maxStage(stage, "passed");
      if (cert.stage === "complete") {
        const open = await client.query<{ n: string }>(
          `
            SELECT count(*)::text AS n
              FROM audit.audit_events
             WHERE severity IN ('warning','critical')
               AND payload->>'scenario_key' = $1
          `,
          [def.key]
        );
        if (Number(open.rows[0]?.n ?? 0) === 0) stage = maxStage(stage, "complete");
        else notes.push("open defect(s) recorded — Complete withheld");
      }
    } else if (cert.stage === "passed" || cert.stage === "complete") {
      // Cert says green, the data says otherwise. The data wins.
      notes.push("DOWNGRADED: certification says passed but the live predicate no longer holds");
      state = "fix";
    }
    notes.push(
      `cert by ${cert.verified_by} @ ${cert.verified_at}${cert.superseded ? " (superseded)" : ""}: ${cert.evidence}`
    );
  }

  return {
    key: def.key,
    title: def.title,
    lane: def.lane,
    stage,
    state,
    evidence: notes.join(" · "),
    je: def.je,
    je_contract: def.je_contract ?? null,
    spec_ref: def.spec_ref,
  };
}

export async function probeSourceHealth(client: QueryClient, nowCt: string): Promise<SourceHealth[]> {
  const out: SourceHealth[] = [];
  for (const source of ALL_SOURCES) {
    try {
      const ok = await relationPresent(client, source);
      out.push({ source, ok, probed_at_ct: nowCt, detail: ok ? undefined : "relation not found on prod" });
    } catch (err) {
      out.push({
        source,
        ok: false,
        probed_at_ct: nowCt,
        detail: err instanceof Error ? err.message : "probe failed",
      });
    }
  }
  return out;
}

export type ScenarioTrackerResponse = {
  generated_at_utc: string;
  generated_at_ct: string;
  tz_label: "CT";
  max_age_seconds: number;
  entity_scope: string;
  hops: ScenarioResult[];
  source_health: SourceHealth[];
};

export const MAX_AGE_SECONDS = 20;

export async function buildScenarioTracker(
  client: PoolClient | QueryClient,
  entity: string | null,
  entityScope: string
): Promise<ScenarioTrackerResponse> {
  const q = client as QueryClient;
  const t = await q.query<{ utc: string; ct: string }>(
    `SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS utc, ${centralTimeSql()} AS ct`
  );
  const generatedUtc = t.rows[0]?.utc ?? new Date().toISOString();
  const generatedCt = t.rows[0]?.ct ?? "";

  const hops: ScenarioResult[] = [];
  for (const def of SCENARIO_REGISTRY) {
    try {
      hops.push(await probeScenario(q, def, entity));
    } catch (err) {
      // A failed probe is reported as a failed probe — never as a green dot.
      hops.push({
        key: def.key,
        title: def.title,
        lane: def.lane,
        stage: "spec",
        state: "fix",
        evidence: `probe failed: ${err instanceof Error ? err.message : "unknown error"}`,
        je: def.je,
        je_contract: def.je_contract ?? null,
        spec_ref: def.spec_ref,
      });
    }
  }

  return {
    generated_at_utc: generatedUtc,
    generated_at_ct: generatedCt,
    tz_label: "CT",
    max_age_seconds: MAX_AGE_SECONDS,
    entity_scope: entityScope,
    hops,
    source_health: await probeSourceHealth(q, generatedCt),
  };
}
