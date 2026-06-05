import { lookupCarrierByMC, lookupCarrierByUSDOT, type CarrierResult } from "../lib/fmcsa-client.js";

export type SaferEntityType = "customer" | "vendor";

export type SaferVerificationResult = {
  entity_type: SaferEntityType;
  entity_id: string;
  operating_company_id: string;
  lookup_type: "mc" | "usdot" | null;
  lookup_value: string | null;
  safer_status: "verified" | "failed" | "skipped" | "error";
  safer_authority_status: string | null;
  safer_oos_status: string | null;
  safer_verified_at: string | null;
  legal_name: string | null;
  insurance_status: string | null;
  source: "fmcsa_mobile" | "fmcsa_safer" | null;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type EntityRow = {
  id: string;
  operating_company_id: string;
  mc_number: string | null;
  dot_number: string | null;
  safer_verified_at: string | null;
};

const ENTITY_TABLE: Record<SaferEntityType, string> = {
  customer: "mdata.customers",
  vendor: "mdata.vendors",
};

function normalizeLookup(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickLookup(row: EntityRow): { type: "mc" | "usdot"; value: string } | null {
  const mc = normalizeLookup(row.mc_number);
  if (mc) return { type: "mc", value: mc };
  const dot = normalizeLookup(row.dot_number);
  if (dot) return { type: "usdot", value: dot };
  return null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSaferOperatingStatus(rawText: string): string {
  const plain = decodeHtml(rawText);
  const oosDate = plain.match(/Out of Service Date:\s*([^\n]+?)(?:\s+Operating Status:|$)/i)?.[1]?.trim();
  if (oosDate && !/none|not applicable|n\/a/i.test(oosDate)) {
    return "out_of_service";
  }
  const operating = plain.match(/Operating Status:\s*([^\n]+?)(?:\s+Out of Service|$)/i)?.[1]?.trim();
  if (operating) {
    if (/out of service|not authorized to operate/i.test(operating)) return "out_of_service";
    if (/authorized|active|in service|operating/i.test(operating)) return "in_service";
    return operating.toLowerCase().replace(/\s+/g, "_");
  }
  return "unknown";
}

export function deriveSaferFieldsFromCarrier(carrier: CarrierResult | null, rawHtml?: string) {
  if (!carrier) {
    return {
      safer_status: "failed" as const,
      safer_authority_status: "NONE",
      safer_oos_status: "unknown",
      safer_verified_at: null as string | null,
    };
  }

  const authority = carrier.authority_status ?? "NONE";
  const oosFromHtml = rawHtml ? parseSaferOperatingStatus(rawHtml) : "unknown";
  const saferOos =
    oosFromHtml === "out_of_service" || authority === "REVOKED" || authority === "INACTIVE"
      ? "out_of_service"
      : authority === "ACTIVE"
        ? "in_service"
        : oosFromHtml;

  const verified = authority === "ACTIVE" && saferOos !== "out_of_service";
  return {
    safer_status: verified ? ("verified" as const) : ("failed" as const),
    safer_authority_status: authority,
    safer_oos_status: saferOos,
    safer_verified_at: verified ? new Date().toISOString() : null,
  };
}

function extractRawHtml(carrier: CarrierResult | null): string | undefined {
  if (!carrier?.raw || typeof carrier.raw !== "object") return undefined;
  const raw = carrier.raw as { html?: unknown };
  return typeof raw.html === "string" ? raw.html : undefined;
}

async function lookupCarrier(type: "mc" | "usdot", value: string) {
  return type === "mc" ? lookupCarrierByMC(value) : lookupCarrierByUSDOT(value);
}

export async function verifySaferEntity(
  client: DbClient,
  params: {
    entityType: SaferEntityType;
    entityId: string;
    operatingCompanyId: string;
    force?: boolean;
  }
): Promise<SaferVerificationResult> {
  const table = ENTITY_TABLE[params.entityType];
  const loaded = await client.query<EntityRow>(
    `
      SELECT id::text, operating_company_id::text, mc_number, dot_number, safer_verified_at::text
      FROM ${table}
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [params.entityId, params.operatingCompanyId]
  );
  const row = loaded.rows[0];
  if (!row) {
    throw new Error("entity_not_found");
  }

  if (!params.force && row.safer_verified_at) {
    const ageMs = Date.now() - Date.parse(row.safer_verified_at);
    if (Number.isFinite(ageMs) && ageMs < 7 * 86_400_000) {
      const current = await client.query<{
        safer_status: string | null;
        safer_authority_status: string | null;
        safer_oos_status: string | null;
        safer_verified_at: string | null;
      }>(
        `
          SELECT safer_status, safer_authority_status, safer_oos_status, safer_verified_at::text
          FROM ${table}
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [params.entityId]
      );
      const cached = current.rows[0];
      return {
        entity_type: params.entityType,
        entity_id: params.entityId,
        operating_company_id: params.operatingCompanyId,
        lookup_type: null,
        lookup_value: null,
        safer_status: (cached?.safer_status as SaferVerificationResult["safer_status"]) ?? "verified",
        safer_authority_status: cached?.safer_authority_status ?? null,
        safer_oos_status: cached?.safer_oos_status ?? null,
        safer_verified_at: cached?.safer_verified_at ?? row.safer_verified_at,
        legal_name: null,
        insurance_status: null,
        source: null,
      };
    }
  }

  const lookup = pickLookup(row);
  if (!lookup) {
    await client.query(
      `
        UPDATE ${table}
        SET
          safer_status = 'skipped',
          safer_authority_status = NULL,
          safer_oos_status = NULL,
          safer_verified_at = NULL,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [params.entityId]
    );
    return {
      entity_type: params.entityType,
      entity_id: params.entityId,
      operating_company_id: params.operatingCompanyId,
      lookup_type: null,
      lookup_value: null,
      safer_status: "skipped",
      safer_authority_status: null,
      safer_oos_status: null,
      safer_verified_at: null,
      legal_name: null,
      insurance_status: null,
      source: null,
    };
  }

  let carrier: CarrierResult | null = null;
  try {
    carrier = await lookupCarrier(lookup.type, lookup.value);
  } catch {
    await client.query(
      `
        UPDATE ${table}
        SET
          safer_status = 'error',
          safer_authority_status = NULL,
          safer_oos_status = NULL,
          safer_verified_at = NULL,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [params.entityId]
    );
    return {
      entity_type: params.entityType,
      entity_id: params.entityId,
      operating_company_id: params.operatingCompanyId,
      lookup_type: lookup.type,
      lookup_value: lookup.value,
      safer_status: "error",
      safer_authority_status: null,
      safer_oos_status: null,
      safer_verified_at: null,
      legal_name: null,
      insurance_status: null,
      source: null,
    };
  }

  const derived = deriveSaferFieldsFromCarrier(carrier, extractRawHtml(carrier));
  await client.query(
    `
      UPDATE ${table}
      SET
        safer_status = $3,
        safer_authority_status = $4,
        safer_oos_status = $5,
        safer_verified_at = $6::timestamptz,
        updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [
      params.entityId,
      params.operatingCompanyId,
      derived.safer_status,
      derived.safer_authority_status,
      derived.safer_oos_status,
      derived.safer_verified_at,
    ]
  );

  return {
    entity_type: params.entityType,
    entity_id: params.entityId,
    operating_company_id: params.operatingCompanyId,
    lookup_type: lookup.type,
    lookup_value: lookup.value,
    safer_status: derived.safer_status,
    safer_authority_status: derived.safer_authority_status,
    safer_oos_status: derived.safer_oos_status,
    safer_verified_at: derived.safer_verified_at,
    legal_name: carrier?.legal_name ?? null,
    insurance_status: carrier?.insurance_status ?? null,
    source: extractRawHtml(carrier) ? "fmcsa_safer" : carrier ? "fmcsa_mobile" : null,
  };
}

export async function listStaleSaferEntities(client: DbClient, operatingCompanyId?: string, limit = 200) {
  const companyFilter = operatingCompanyId ? "AND operating_company_id = $2::uuid" : "";
  const params = operatingCompanyId ? [limit, operatingCompanyId] : [limit];
  const customers = await client.query<{ id: string; operating_company_id: string; entity_type: SaferEntityType }>(
    `
      SELECT id::text, operating_company_id::text, 'customer'::text AS entity_type
      FROM mdata.customers
      WHERE deactivated_at IS NULL
        AND (
          NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(dot_number, '')), '') IS NOT NULL
        )
        AND (
          safer_verified_at IS NULL
          OR safer_verified_at < now() - interval '7 days'
        )
        ${companyFilter}
      ORDER BY safer_verified_at NULLS FIRST, updated_at ASC
      LIMIT $1
    `,
    params
  );
  const vendors = await client.query<{ id: string; operating_company_id: string; entity_type: SaferEntityType }>(
    `
      SELECT id::text, operating_company_id::text, 'vendor'::text AS entity_type
      FROM mdata.vendors
      WHERE deactivated_at IS NULL
        AND (
          NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(dot_number, '')), '') IS NOT NULL
        )
        AND (
          safer_verified_at IS NULL
          OR safer_verified_at < now() - interval '7 days'
        )
        ${companyFilter}
      ORDER BY safer_verified_at NULLS FIRST, updated_at ASC
      LIMIT $1
    `,
    params
  );
  return [...customers.rows, ...vendors.rows];
}

export async function computeSaferCoverage(client: DbClient, operatingCompanyId: string) {
  const res = await client.query<{
    with_mc: string;
    verified_recent: string;
  }>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
            AND deactivated_at IS NULL
        )::text AS with_mc,
        COUNT(*) FILTER (
          WHERE NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
            AND deactivated_at IS NULL
            AND safer_verified_at IS NOT NULL
            AND safer_verified_at >= now() - interval '30 days'
        )::text AS verified_recent
      FROM mdata.customers
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  const row = res.rows[0] ?? { with_mc: "0", verified_recent: "0" };
  const withMc = Number(row.with_mc ?? 0);
  const verifiedRecent = Number(row.verified_recent ?? 0);
  const coveragePct = withMc > 0 ? (verifiedRecent / withMc) * 100 : 100;
  return {
    customers_with_mc: withMc,
    customers_verified_recent: verifiedRecent,
    coverage_pct: Number(coveragePct.toFixed(2)),
    meets_threshold: withMc === 0 || coveragePct >= 90,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
