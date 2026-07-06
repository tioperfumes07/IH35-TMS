// BLOCK-03 — IFTA jurisdiction tax-rate catalog reader.
//
// Prefers the DB catalog (reference.ifta_tax_rates / reference.non_ifta_jurisdictions, migration
// 202607130200_block03_ifta_trip_methodology_extend.sql) and falls back to the pre-existing
// ifta-tax-rates.json file when a (jurisdiction, quarter, year) row is absent — so behavior is
// unchanged until the migration is actually run (it is HELD) and the catalog is populated.
import taxRatesJson from "./ifta-tax-rates.json" with { type: "json" };

export type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

export type JurisdictionInfo = {
  jurisdictionCode: string;
  taxRatePerGallon: number;
  isIftaJurisdiction: boolean;
  source: "db_catalog" | "json_fallback" | "non_ifta_catalog";
};

const rawRates = taxRatesJson as Record<string, unknown>;
const jsonRates: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(rawRates).filter(([key, value]) => !key.startsWith("_") && value && typeof value === "object")
) as Record<string, Record<string, number>>;

function quarterRateKey(quarter: number, year: number) {
  return `Q${quarter}-${year}`;
}

function jsonRateForState(quarter: number, year: number, state: string): number {
  const bucket = jsonRates[quarterRateKey(quarter, year)];
  if (!bucket) return 0;
  return Number(bucket[state.toUpperCase()] ?? 0);
}

/**
 * Loads jurisdiction info (rate + IFTA-membership flag) for every state code present in
 * `stateCodes`, for the given quarter/year. DB catalog first, JSON fallback second, and any
 * jurisdiction found in reference.non_ifta_jurisdictions is always is_ifta_jurisdiction=false
 * with a $0 rate regardless of what the JSON/DB rate table says (Mexico is never an IFTA member).
 */
export async function loadJurisdictionCatalog(
  client: Queryable,
  quarter: number,
  year: number,
  stateCodes: string[]
): Promise<Map<string, JurisdictionInfo>> {
  const codes = [...new Set(stateCodes.map((s) => s.toUpperCase().trim()).filter(Boolean))];
  const out = new Map<string, JurisdictionInfo>();
  if (codes.length === 0) return out;

  let dbRows: Array<{ jurisdiction_code: string; tax_rate_per_gallon: string }> = [];
  let nonIftaCodes = new Set<string>();
  try {
    const rateRes = await client.query<{ jurisdiction_code: string; tax_rate_per_gallon: string }>(
      `
        SELECT jurisdiction_code, tax_rate_per_gallon
        FROM reference.ifta_tax_rates
        WHERE quarter = $1 AND year = $2 AND jurisdiction_code = ANY($3::text[])
      `,
      [quarter, year, codes]
    );
    dbRows = rateRes.rows;
    const nonIftaRes = await client.query<{ jurisdiction_code: string }>(
      `SELECT jurisdiction_code FROM reference.non_ifta_jurisdictions WHERE jurisdiction_code = ANY($1::text[])`,
      [codes]
    );
    nonIftaCodes = new Set(nonIftaRes.rows.map((r) => r.jurisdiction_code));
  } catch {
    // Migration not yet run (HELD) or tables absent — fall through to JSON-only behavior below.
    dbRows = [];
    nonIftaCodes = new Set();
  }

  const dbRateByCode = new Map(dbRows.map((r) => [r.jurisdiction_code, Number(r.tax_rate_per_gallon)]));

  for (const code of codes) {
    if (nonIftaCodes.has(code)) {
      out.set(code, { jurisdictionCode: code, taxRatePerGallon: 0, isIftaJurisdiction: false, source: "non_ifta_catalog" });
      continue;
    }
    if (dbRateByCode.has(code)) {
      out.set(code, {
        jurisdictionCode: code,
        taxRatePerGallon: dbRateByCode.get(code) ?? 0,
        isIftaJurisdiction: true,
        source: "db_catalog",
      });
      continue;
    }
    out.set(code, {
      jurisdictionCode: code,
      taxRatePerGallon: jsonRateForState(quarter, year, code),
      isIftaJurisdiction: true,
      source: "json_fallback",
    });
  }
  return out;
}
