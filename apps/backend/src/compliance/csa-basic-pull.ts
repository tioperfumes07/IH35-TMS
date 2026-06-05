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

const SAFER_SNAPSHOT_BASE = "https://safer.fmcsa.dot.gov/query.asp";
const FETCH_TIMEOUT_MS = 30_000;
let cronInitialized = false;

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

const BASIC_LABEL_HINTS: Record<CsaBasicCategory, string[]> = {
  unsafe_driving: ["unsafe driving"],
  hos_compliance: ["hos compliance", "hours-of-service compliance", "hours of service compliance"],
  driver_fitness: ["driver fitness"],
  controlled_substances_alcohol: ["controlled substances/alcohol", "controlled substances / alcohol", "controlled substances"],
  vehicle_maintenance: ["vehicle maintenance"],
  hazmat_compliance: ["hazmat compliance", "hazardous materials compliance"],
  crash_indicator: ["crash indicator"],
};

function resolveAlertStatus(score: number | null, threshold: number): CsaAlertStatus {
  if (score == null) return "inconclusive";
  return score >= threshold ? "yes" : "no";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Number(value.toFixed(2));
}

function normalizeHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumbers(segment: string): number[] {
  const matches = segment.match(/\d{1,3}(?:\.\d+)?/g) ?? [];
  return matches
    .map((raw) => Number(raw))
    .filter((num) => Number.isFinite(num) && num >= 0 && num <= 1000);
}

function pickScoreAndPercentile(segment: string): { score: number | null; pctPercentile: number | null } {
  const percentMatches = [...segment.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const allNumbers = extractNumbers(segment).filter((value) => value <= 100);
  const score = allNumbers.length > 0 ? clampScore(allNumbers[0]) : null;
  const pctPercentile =
    percentMatches.length > 0
      ? clampScore(percentMatches[0])
      : allNumbers.length > 1
        ? clampScore(allNumbers[1])
        : null;
  return { score, pctPercentile };
}

function extractBasicMetrics(normalizedText: string, hints: string[]): { score: number | null; pctPercentile: number | null } {
  const lower = normalizedText.toLowerCase();
  for (const hint of hints) {
    const at = lower.indexOf(hint);
    if (at < 0) continue;
    const segment = normalizedText.slice(Math.max(0, at - 20), at + 280);
    const metrics = pickScoreAndPercentile(segment);
    if (metrics.score != null || metrics.pctPercentile != null) {
      return metrics;
    }
  }
  return { score: null, pctPercentile: null };
}

async function fetchSaferSnapshotText(usdotNumber: string): Promise<{ sourceUrl: string; text: string }> {
  const normalized = usdotNumber.trim();
  if (!normalized) throw new Error("usdot_number_required");
  const sourceUrl = `${SAFER_SNAPSHOT_BASE}?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(
    normalized
  )}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: { Accept: "text/html" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`safer_http_${response.status}`);
    }
    const html = await response.text();
    if (/no records found|unable to locate|record inactive/i.test(html)) {
      throw new Error("safer_record_not_found");
    }
    return { sourceUrl, text: normalizeHtmlToText(html) };
  } finally {
    clearTimeout(timer);
  }
}

export function parseSaferCsaSnapshot(rawText: string): CsaPulledBasicRow[] {
  return CSA_BASIC_CATEGORIES.map((basicCategory) => {
    const metrics = extractBasicMetrics(rawText, BASIC_LABEL_HINTS[basicCategory]);
    const threshold = CSA_THRESHOLDS[basicCategory];
    const score = metrics.score != null ? clampScore(metrics.score) : null;
    const percentile = metrics.pctPercentile != null ? clampScore(metrics.pctPercentile) : null;
    return {
      basic_category: basicCategory,
      score,
      pct_percentile: percentile,
      threshold,
      alert_status: resolveAlertStatus(score, threshold),
    };
  });
}

export async function pullCsaBasicsFromSafer(usdotNumber: string): Promise<{
  source_url: string;
  raw_text: string;
  basics: CsaPulledBasicRow[];
}> {
  const payload = await fetchSaferSnapshotText(usdotNumber);
  return {
    source_url: payload.sourceUrl,
    raw_text: payload.text,
    basics: parseSaferCsaSnapshot(payload.text),
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
  const persisted = await persistCsaBasicSnapshot(client, {
    operatingCompanyId: params.operatingCompanyId,
    sourceDotNumber: params.usdotNumber,
    sourceUrl: pulled.source_url,
    basics: pulled.basics,
  });
  return {
    ...persisted,
    source_url: pulled.source_url,
    basics: pulled.basics,
    inconclusive_count: pulled.basics.filter((row) => row.score == null).length,
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
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
  if (process.env.ENABLE_CSA_BASIC_PULL_CRON === "false") {
    app.log.info("CSA BASIC pull cron disabled via ENABLE_CSA_BASIC_PULL_CRON=false");
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
    { timezone: "America/Chicago" }
  );
  app.log.info("CSA BASIC pull cron scheduled (daily 05:30 America/Chicago)");
}
