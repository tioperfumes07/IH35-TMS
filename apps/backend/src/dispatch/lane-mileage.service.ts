/**
 * GO-16 Rev B — lane mileage lookup. History first. Fill only when autofill_allowed.
 * Never derive short miles from practical. Never rebuild stats from Pay / RPM without the team flag.
 * Owner 2026-09-01: customer pays the typed rate; practical miles compute revenue per mile only.
 */
export const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export type LaneMileageRow = {
  id: string;
  origin_city: string;
  origin_state: string;
  origin_postal_code: string | null;
  dest_city: string;
  dest_state: string;
  dest_postal_code: string | null;
  practical_miles: string | number | null;
  short_miles: string | number | null;
  empty_miles: string | number | null;
  n_practical: number | string;
  n_short: number | string | null;
  practical_spread: string | number | null;
  confidence: string;
  autofill_allowed: boolean;
  source: string;
};

export type LaneMileageLookup = {
  origin_city: string;
  origin_state: string;
  origin_postal_code?: string | null;
  dest_city: string;
  dest_state: string;
  dest_postal_code?: string | null;
};

export type LaneMileageResult = {
  practical_miles: number | null;
  short_miles: number | null;
  empty_miles: number | null;
  runs: number;
  short_runs: number | null;
  practical_spread: number | null;
  confidence: string | null;
  autofill_allowed: boolean;
  match: "Matched by ZIP" | "City match" | "From the reverse lane" | "New lane";
  provenance: string;
  matched_lane_id: string | null;
  source: string | null;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function sameLane(a: LaneMileageLookup): boolean {
  return (
    a.origin_city.trim().toLowerCase() === a.dest_city.trim().toLowerCase() &&
    a.origin_state.trim().toLowerCase() === a.dest_state.trim().toLowerCase()
  );
}

export function provenanceFromRow(
  row: LaneMileageRow,
  match: LaneMileageResult["match"]
): string {
  const runs = intOrZero(row.n_practical);
  const practical = numOrNull(row.practical_miles);
  const spread = numOrNull(row.practical_spread);
  if (match === "From the reverse lane") {
    return `From the reverse lane, ${runs} prior runs.`;
  }
  if (row.autofill_allowed && practical != null) {
    return `${runs} prior runs, median ${practical.toLocaleString(undefined, { maximumFractionDigits: 1 })} miles.`;
  }
  if (row.confidence === "Check ZIP") {
    const spreadTxt =
      spread != null ? `, spread ${spread.toLocaleString(undefined, { maximumFractionDigits: 0 })} miles` : "";
    return `${runs} prior runs${spreadTxt}. Enter ZIP to narrow.`;
  }
  if (row.confidence === "Thin") {
    return `${runs} prior run${runs === 1 ? "" : "s"}. Not a rate basis yet.`;
  }
  if (practical != null) {
    return `${runs} prior runs, median ${practical.toLocaleString(undefined, { maximumFractionDigits: 1 })} miles.`;
  }
  return "New lane. Enter the miles.";
}

function toResult(row: LaneMileageRow | null, match: LaneMileageResult["match"]): LaneMileageResult {
  if (!row) {
    return {
      practical_miles: null,
      short_miles: null,
      empty_miles: null,
      runs: 0,
      short_runs: null,
      practical_spread: null,
      confidence: null,
      autofill_allowed: false,
      match: "New lane",
      provenance: "New lane. Enter the miles.",
      matched_lane_id: null,
      source: null,
    };
  }
  const labelled = match === "From the reverse lane" ? match : match;
  return {
    practical_miles: numOrNull(row.practical_miles),
    short_miles: numOrNull(row.short_miles),
    empty_miles: numOrNull(row.empty_miles),
    runs: intOrZero(row.n_practical),
    short_runs: numOrNull(row.n_short) != null ? intOrZero(row.n_short) : null,
    practical_spread: numOrNull(row.practical_spread),
    confidence: row.confidence,
    autofill_allowed: Boolean(row.autofill_allowed) && match !== "From the reverse lane",
    match: labelled,
    provenance: provenanceFromRow(row, labelled),
    matched_lane_id: row.id,
    source: row.source,
  };
}

const SELECT_COLS = `
  id, origin_city, origin_state, origin_postal_code, dest_city, dest_state, dest_postal_code,
  practical_miles, short_miles, empty_miles, n_practical, n_short, practical_spread,
  confidence, autofill_allowed, source
`;

export async function resolveLaneMileage(
  client: Queryable,
  operatingCompanyId: string,
  lookup: LaneMileageLookup
): Promise<LaneMileageResult> {
  const originCity = lookup.origin_city.trim();
  const originState = lookup.origin_state.trim();
  const destCity = lookup.dest_city.trim();
  const destState = lookup.dest_state.trim();
  const originZip = (lookup.origin_postal_code ?? "").trim() || null;
  const destZip = (lookup.dest_postal_code ?? "").trim() || null;

  if (!originCity || !originState || !destCity || !destState) {
    return toResult(null, "New lane");
  }
  if (sameLane(lookup)) {
    return toResult(null, "New lane");
  }

  if (originZip && destZip) {
    const zip = await client.query<LaneMileageRow>(
      `SELECT ${SELECT_COLS}
         FROM catalogs.lane_mileage
        WHERE operating_company_id = $1::uuid
          AND origin_postal_code = $2
          AND dest_postal_code = $3
        LIMIT 1`,
      [operatingCompanyId, originZip, destZip]
    );
    if (zip.rows[0]) return toResult(zip.rows[0], "Matched by ZIP");
  }

  const city = await client.query<LaneMileageRow>(
    `SELECT ${SELECT_COLS}
       FROM catalogs.lane_mileage
      WHERE operating_company_id = $1::uuid
        AND lower(origin_city) = lower($2)
        AND lower(origin_state) = lower($3)
        AND lower(dest_city) = lower($4)
        AND lower(dest_state) = lower($5)
        AND origin_postal_code IS NULL
        AND dest_postal_code IS NULL
      LIMIT 1`,
    [operatingCompanyId, originCity, originState, destCity, destState]
  );
  if (city.rows[0]) return toResult(city.rows[0], "City match");

  const reverse = await client.query<LaneMileageRow>(
    `SELECT ${SELECT_COLS}
       FROM catalogs.lane_mileage
      WHERE operating_company_id = $1::uuid
        AND lower(origin_city) = lower($2)
        AND lower(origin_state) = lower($3)
        AND lower(dest_city) = lower($4)
        AND lower(dest_state) = lower($5)
        AND origin_postal_code IS NULL
        AND dest_postal_code IS NULL
      LIMIT 1`,
    [operatingCompanyId, destCity, destState, originCity, originState]
  );
  if (reverse.rows[0]) return toResult(reverse.rows[0], "From the reverse lane");

  return toResult(null, "New lane");
}
