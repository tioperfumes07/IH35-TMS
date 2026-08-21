import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import {
  CSA_BASIC_CATEGORIES,
  CSA_THRESHOLDS,
  type CsaAlertStatus,
  type CsaBasicCategory,
} from "./csa-basic-projection.js";

const FMCSA_SMS_MEASURE_URL = "https://csa.fmcsa.dot.gov/about/Measure";
let cronInitialized = false;

// FMCSA does not expose these BASICs to the public. They are available only to
// the carrier in its authenticated SMS profile (or to enforcement personnel).
// Public SAFER/SMS text must never be interpreted as their measure/percentile.
export const AUTHENTICATED_SMS_ONLY_CATEGORIES = new Set<CsaBasicCategory>([
  "hazmat_compliance",
  "crash_indicator",
]);

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type CompanyRow = {
  id: string;
  usdot_number: string | null;
};

export type CsaPulledBasicRow = {
  basic_category: CsaBasicCategory;
  score: number | null;
  pct_percentile: number | null;
  threshold: number;
  alert_status: CsaAlertStatus;
};

// SAFER Company Snapshot contains inspection/OOS summaries, crash counts, and
// safety-rating data, not authoritative SMS BASIC measures or percentiles.
// Keep this compatibility entry point fail-closed: input text is intentionally
// ignored and every BASIC remains unavailable.
export function parseSaferCsaSnapshot(_rawText: string): CsaPulledBasicRow[] {
  return CSA_BASIC_CATEGORIES.map((basicCategory) => {
    return {
      basic_category: basicCategory,
      score: null,
      pct_percentile: null,
      threshold: CSA_THRESHOLDS[basicCategory],
      alert_status: "inconclusive",
    };
  });
}

export async function pullCsaBasicsFromSafer(usdotNumber: string): Promise<{
  source_url: string;
  raw_text: string;
  basics: CsaPulledBasicRow[];
}> {
  if (!usdotNumber.trim()) throw new Error("usdot_number_required");
  return {
    source_url: FMCSA_SMS_MEASURE_URL,
    raw_text: "",
    basics: parseSaferCsaSnapshot(""),
  };
}

export async function persistCsaBasicSnapshot(
  client: DbClient,
  params: {
    operatingCompanyId: string;
    sourceDotNumber: string;
    sourceUrl: string;
    basics: ReadonlyArray<CsaPulledBasicRow>;
    pulledAt?: Date;
    snapshotDate?: string;
  }
) {
  const pulledAt = params.pulledAt ?? new Date();
  const snapshotDate = params.snapshotDate ?? pulledAt.toISOString().slice(0, 10);
  for (const basic of params.basics) {
    await client.query(
      `
        INSERT INTO compliance.csa_basic_scores (
          operating_company_id,
          snapshot_date,
          basic_category,
          score,
          pct_percentile,
          threshold,
          alert_status,
          pulled_at,
          source_url,
          source_dot_number
        )
        VALUES ($1::uuid, $2::date, $3::compliance.csa_basic_category, $4, $5, $6, $7::compliance.csa_alert_status, $8::timestamptz, $9, $10)
        ON CONFLICT (operating_company_id, snapshot_date, basic_category)
        DO UPDATE SET
          score = EXCLUDED.score,
          pct_percentile = EXCLUDED.pct_percentile,
          threshold = EXCLUDED.threshold,
          alert_status = EXCLUDED.alert_status,
          pulled_at = EXCLUDED.pulled_at,
          source_url = EXCLUDED.source_url,
          source_dot_number = EXCLUDED.source_dot_number
      `,
      [
        params.operatingCompanyId,
        snapshotDate,
        basic.basic_category,
        basic.score,
        basic.pct_percentile,
        basic.threshold,
        basic.alert_status,
        pulledAt.toISOString(),
        params.sourceUrl,
        params.sourceDotNumber,
      ]
    );
  }
  return { snapshot_date: snapshotDate, pulled_at: pulledAt.toISOString(), row_count: params.basics.length };
}

export async function pullAndPersistCsaBasicsForCompany(
  client: DbClient,
  params: { operatingCompanyId: string; usdotNumber: string }
) {
  const pulled = await pullCsaBasicsFromSafer(params.usdotNumber);
  const availableBasics = pulled.basics.filter(
    (basic) => basic.score != null || basic.pct_percentile != null
  );
  if (availableBasics.length === 0) {
    throw new Error("public_csa_basic_source_unavailable");
  }
  const persisted = await persistCsaBasicSnapshot(client, {
    operatingCompanyId: params.operatingCompanyId,
    sourceDotNumber: params.usdotNumber,
    sourceUrl: pulled.source_url,
    basics: availableBasics,
  });
  return {
    ...persisted,
    source_url: pulled.source_url,
    basics: pulled.basics,
    available_metric_count: availableBasics.length,
    unavailable_metric_count: pulled.basics.length - availableBasics.length,
  };
}

async function listCompaniesForPull(client: DbClient, onlyCompanyId?: string): Promise<CompanyRow[]> {
  if (onlyCompanyId) {
    const scoped = await client.query<CompanyRow>(
      `
        SELECT id::text, usdot_number
        FROM org.companies
        WHERE id = $1::uuid
          AND is_active = true
        LIMIT 1
      `,
      [onlyCompanyId]
    );
    return scoped.rows;
  }
  const all = await client.query<CompanyRow>(
    `
      SELECT id::text, usdot_number
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
        AND NULLIF(trim(COALESCE(usdot_number, '')), '') IS NOT NULL
        -- COMP-F71: a USDOT number is numeric. org.companies also holds PLACEHOLDER values
        -- ('PENDING-USMCA-DOT' on prod), which passed the not-null filter, were sent to the live
        -- public SAFER lookup, and came back public_csa_basic_source_unavailable — recorded as a job
        -- FAILURE on every run. A carrier that has not been issued a DOT number yet is a designed
        -- state, not a failure, and the placeholder is precisely how that state is expressed.
        -- Skipping it also stops a sentinel string being sent to an external regulator lookup.
        AND trim(usdot_number) ~ '^[0-9]+$'
      ORDER BY id
    `
  );
  return all.rows;
}

export async function runCsaBasicPullTick(onlyCompanyId?: string) {
  const failures: string[] = [];
  let successCount = 0;
  await withLuciaBypass(async (client) => {
    const companies = await listCompaniesForPull(client, onlyCompanyId);
    for (const company of companies) {
      assertTenantContext(company.id, "compliance.csa_basic_pull_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const usdot = company.usdot_number?.trim() ?? "";
      if (!usdot) {
        failures.push(`${company.id}:missing_usdot`);
        continue;
      }
      try {
        await pullAndPersistCsaBasicsForCompany(client, {
          operatingCompanyId: company.id,
          usdotNumber: usdot,
        });
        successCount += 1;
      } catch (error) {
        const reason = (error as Error).message ?? "unknown_error";
        failures.push(`${company.id}:${reason}`);
      }
    }
  });

  if (failures.length > 0) {
    const preview = failures.slice(0, 5).join(", ");
    throw new Error(`csa_basic_pull_partial_failure success=${successCount} failures=${failures.length} details=${preview}`);
  }
  return { success_count: successCount, failure_count: failures.length };
}

export function initializeCsaBasicPullCron(app: FastifyInstance) {
  if (cronInitialized) return;
  cronInitialized = true;
  // Public SAFER exposes inspection/OOS summaries, not carrier-only SMS BASIC measures. Until an
  // authenticated SMS source is configured, repeatedly running this worker can only fail with
  // public_csa_basic_source_unavailable. Require explicit opt-in and keep health on the same gate.
  if (process.env.ENABLE_CSA_BASIC_PULL_CRON !== "true") {
    app.log.info("CSA BASIC pull cron disabled (requires ENABLE_CSA_BASIC_PULL_CRON=true)");
    return;
  }
  cron.schedule(
    "30 5 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "compliance.csa_basic_pull_cron",
        async () => {
          await runCsaBasicPullTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("CSA BASIC pull cron scheduled (daily 05:30 America/Chicago)");
}
