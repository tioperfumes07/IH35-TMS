import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { DateTime } from "luxon";
import { withLuciaBypass } from "../auth/db.js";
import { postDepreciation, type AmortizationPostingResult } from "../accounting/amortization-posting/amortization-posting.service.js";
import { AmortizationPostingError } from "../accounting/amortization-posting/amortization-posting.math.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const CRON_NAME = "accounting.depreciation_autopost";
const CRON_EXPRESSION = "15 6 1 * *";
const CRON_TZ = "America/Chicago";
const FIXED_ASSET_AUTOPOST_FLAG_KEY = "FIXED_ASSET_AUTOPOST_ENABLED";
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-0000-0000-000000000001";

let initialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type DepreciationAutopostOutcome = "posted" | "nothing_to_post" | "skipped_flag_off" | "error";

type ActiveAssetRow = { asset_id: string };

export async function listActiveOperatingCompanyIds(client: DbClient): Promise<string[]> {
  const result = await client.query<{ operating_company_id: string }>(
    `
      SELECT id::text AS operating_company_id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return result.rows.map((row) => row.operating_company_id);
}

/**
 * Fixed assets themselves have no is_sample_data column in the canonical schema. A linked sample
 * unit makes the asset ineligible; unlinked assets remain eligible because there is no sample marker
 * to exclude. This preserves the canonical accounting.fixed_assets register without inventing a
 * parallel asset-data flag.
 */
export async function listEligibleAssetIds(client: DbClient, operatingCompanyId: string): Promise<string[]> {
  const result = await client.query<ActiveAssetRow>(
    `
      SELECT fixed_asset.id::text AS asset_id
      FROM accounting.fixed_assets AS fixed_asset
      LEFT JOIN mdata.units AS unit
        ON unit.id = fixed_asset.unit_uuid
       AND COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = fixed_asset.operating_company_id
      WHERE fixed_asset.operating_company_id = $1::uuid
        AND fixed_asset.is_active = true
        AND fixed_asset.status = 'active'
        AND COALESCE(unit.is_sample_data, false) = false
      ORDER BY fixed_asset.id
    `,
    [operatingCompanyId]
  );
  return result.rows.map((row) => row.asset_id);
}

function resultMetrics(result: AmortizationPostingResult) {
  return {
    outcome: result.result as Exclude<DepreciationAutopostOutcome, "error">,
    period_count: result.result === "posted" ? result.period_count : 0,
    total_posted_cents: result.result === "posted" ? result.total_posted_cents : 0,
  };
}

function errorDetails(error: unknown): { error_code: string; error_message: string } {
  if (error instanceof AmortizationPostingError) {
    return { error_code: error.code, error_message: error.message };
  }
  return {
    error_code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    error_message: error instanceof Error ? error.message : String(error),
  };
}

export async function insertDepreciationAutopostRun(
  client: DbClient,
  args: {
    operating_company_id: string;
    run_date: string;
    asset_id: string;
    outcome: DepreciationAutopostOutcome;
    period_count?: number;
    total_posted_cents?: number;
    error_code?: string | null;
    error_message?: string | null;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO accounting.depreciation_autopost_runs (
        operating_company_id,
        run_date,
        asset_id,
        outcome,
        period_count,
        total_posted_cents,
        error_code,
        error_message
      )
      VALUES ($1::uuid, $2::date, $3::uuid, $4, $5, $6, $7, $8)
    `,
    [
      args.operating_company_id,
      args.run_date,
      args.asset_id,
      args.outcome,
      args.period_count ?? 0,
      args.total_posted_cents ?? 0,
      args.error_code ?? null,
      args.error_message ?? null,
    ]
  );
}

export async function runDepreciationAutopostCronTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  postDepreciationImpl?: typeof postDepreciation;
  runDate?: string;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const postDepreciationImpl = deps?.postDepreciationImpl ?? postDepreciation;
  const runDate = deps?.runDate ?? DateTime.now().setZone(CRON_TZ).toISODate();
  if (!runDate) throw new Error("depreciation_autopost_run_date_unavailable");

  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));
  const summary = { company_count: companyIds.length, assets_seen: 0, posted: 0, nothing_to_post: 0, skipped_flag_off: 0, error: 0 };

  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    const { enabled, assetIds } = await withLuciaBypassImpl(async (client) => {
      const [flagEnabled, ids] = await Promise.all([
        isEnabled(client as never, FIXED_ASSET_AUTOPOST_FLAG_KEY, {
          operating_company_id: operatingCompanyId,
          user_uuid: SYSTEM_ACTOR_ID,
        }),
        listEligibleAssetIds(client, operatingCompanyId),
      ]);
      return { enabled: flagEnabled, assetIds: ids };
    });

    for (const assetId of assetIds) {
      summary.assets_seen += 1;
      let outcome: DepreciationAutopostOutcome;
      let periodCount = 0;
      let totalPostedCents = 0;
      let errorCode: string | null = null;
      let errorMessage: string | null = null;

      if (!enabled) {
        outcome = "skipped_flag_off";
      } else {
        try {
          const result = await postDepreciationImpl(
            { operatingCompanyId, assetId, runDate },
            { userId: SYSTEM_ACTOR_ID }
          );
          ({ outcome, period_count: periodCount, total_posted_cents: totalPostedCents } = resultMetrics(result));
        } catch (error) {
          outcome = "error";
          ({ error_code: errorCode, error_message: errorMessage } = errorDetails(error));
        }
      }

      await withLuciaBypassImpl(async (client) =>
        insertDepreciationAutopostRun(client, {
          operating_company_id: operatingCompanyId,
          run_date: runDate,
          asset_id: assetId,
          outcome,
          period_count: periodCount,
          total_posted_cents: totalPostedCents,
          error_code: errorCode,
          error_message: errorMessage,
        })
      );
      summary[outcome] += 1;
    }
  }

  return summary;
}

export function initializeDepreciationAutopostCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runDepreciationAutopostCronTick();
          app.log.info(summary, "depreciation autopost cron completed");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Depreciation autopost cron scheduled (monthly 06:15 America/Chicago; flag-gated)");
}
