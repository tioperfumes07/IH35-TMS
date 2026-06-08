// GAP-38 / G15 / WF-027 — Damage continuity worker.
//
// Runs hourly. For each operating company:
//   * Opens a continuity chain for any damage_report incident that does not yet
//     belong to one.
//   * Per WF-027, auto-creates a draft insurance claim for any damage report
//     whose estimate exceeds AUTO_CLAIM_THRESHOLD_CENTS, then links the claim to
//     the damage's continuity chain.
//
// PAUSE guard (per GAP-38 spec): if auto-claim drafting produces excessive
// noise (>5% of assessed damages), set ENABLE_DAMAGE_CONTINUITY_WORKER=false and
// tune the threshold before re-enabling.

import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { startChain, type Queryable } from "../safety/damage-continuity/continuity.service.js";
import {
  AUTO_CLAIM_THRESHOLD_CENTS,
  autoCreateClaimFromDamage,
  linkClaimToChain,
} from "../safety/damage-continuity/insurance-link.service.js";

let initialized = false;

export type DamageContinuityTickSummary = {
  companiesProcessed: number;
  chainsStarted: number;
  claimsCreated: number;
  claimsSkippedNoPolicy: number;
};

export async function processCompanyDamageContinuity(
  client: Queryable,
  operatingCompanyId: string
): Promise<{ chainsStarted: number; claimsCreated: number; claimsSkippedNoPolicy: number }> {
  let chainsStarted = 0;
  let claimsCreated = 0;
  let claimsSkippedNoPolicy = 0;

  const unchained = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM safety.incidents
      WHERE incident_type = 'damage_report'
        AND continuity_chain_id IS NULL
        AND operating_company_id::text = current_setting('app.operating_company_id', true)
      ORDER BY incident_at ASC
      LIMIT 500
    `
  );
  for (const row of unchained.rows) {
    const started = await startChain(client, { operatingCompanyId, initialDamageId: row.id });
    if (started.kind === "ok") chainsStarted += 1;
  }

  const claimCandidates = await client.query<{ id: string; continuity_chain_id: string | null }>(
    `
      SELECT id::text, continuity_chain_id::text
      FROM safety.incidents
      WHERE incident_type = 'damage_report'
        AND auto_created_claim_id IS NULL
        AND damage_amount_cents > $1
        AND operating_company_id::text = current_setting('app.operating_company_id', true)
      ORDER BY incident_at ASC
      LIMIT 500
    `,
    [AUTO_CLAIM_THRESHOLD_CENTS]
  );
  for (const row of claimCandidates.rows) {
    const created = await autoCreateClaimFromDamage(client, {
      operatingCompanyId,
      damageIncidentId: row.id,
    });
    if (created.kind === "created") {
      claimsCreated += 1;
      if (row.continuity_chain_id) {
        await linkClaimToChain(client, {
          operatingCompanyId,
          chainId: row.continuity_chain_id,
          claimId: created.claim.id,
        });
      }
    } else if (created.kind === "no_active_policy") {
      claimsSkippedNoPolicy += 1;
    }
  }

  return { chainsStarted, claimsCreated, claimsSkippedNoPolicy };
}

export async function runDamageContinuityTick(app: FastifyInstance): Promise<DamageContinuityTickSummary> {
  const summary: DamageContinuityTickSummary = {
    companiesProcessed: 0,
    chainsStarted: 0,
    claimsCreated: 0,
    claimsSkippedNoPolicy: 0,
  };

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM safety.incidents
        WHERE incident_type = 'damage_report'
      `
    );

    for (const companyRow of companies.rows) {
      const operatingCompanyId = String(companyRow.operating_company_id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, "safety.damage_continuity_worker");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const result = await processCompanyDamageContinuity(client as Queryable, operatingCompanyId);
      summary.companiesProcessed += 1;
      summary.chainsStarted += result.chainsStarted;
      summary.claimsCreated += result.claimsCreated;
      summary.claimsSkippedNoPolicy += result.claimsSkippedNoPolicy;
    }
  });

  app.log.info({ summary }, "[damage-continuity-worker] tick complete");
  return summary;
}

export function initializeDamageContinuityWorker(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_DAMAGE_CONTINUITY_WORKER === "false") {
    app.log.info("Damage continuity worker disabled via ENABLE_DAMAGE_CONTINUITY_WORKER=false");
    return;
  }

  cron.schedule(
    "0 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "safety.damage_continuity_worker",
        async () => {
          await runDamageContinuityTick(app);
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Damage continuity worker scheduled (hourly, America/Chicago)");
}
