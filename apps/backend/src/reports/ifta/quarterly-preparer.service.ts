import taxRatesJson from "../../ifta/ifta-tax-rates.json" with { type: "json" };
import { calculateStateTaxes } from "../../ifta/ifta-tax-calculator.js";
import { aggregateFuelByJurisdiction } from "./fuel-aggregator.service.js";
import { aggregateMilesByJurisdiction, parseQuarterLabel } from "./mileage-aggregator.service.js";

export type IftaFilingJurisdictionRow = {
  state: string;
  miles: number;
  fuel_gallons: number;
  tax_rate_per_gallon: number;
  taxable_gallons: number;
  net_taxable_gallons: number;
  tax_owed: number;
};

export type IftaFilingData = {
  quarter_label: string;
  year: number;
  quarter: number;
  miles_by_jurisdiction: Record<string, number>;
  fuel_by_jurisdiction: Record<string, number>;
  miles_overrides: Record<string, number>;
  fuel_overrides: Record<string, number>;
  jurisdiction_rows: IftaFilingJurisdictionRow[];
  fleet_mpg: number | null;
  total_tax_owed: number;
  rates_source: string;
  rates_quarter_key: string;
  prepared_at: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const ratesMeta = taxRatesJson as { _source?: string };

function effectiveMiles(data: Pick<IftaFilingData, "miles_by_jurisdiction" | "miles_overrides">, state: string) {
  if (data.miles_overrides[state] != null) return Number(data.miles_overrides[state]);
  return Number(data.miles_by_jurisdiction[state] ?? 0);
}

function effectiveFuel(data: Pick<IftaFilingData, "fuel_by_jurisdiction" | "fuel_overrides">, state: string) {
  if (data.fuel_overrides[state] != null) return Number(data.fuel_overrides[state]);
  return Number(data.fuel_by_jurisdiction[state] ?? 0);
}

export function buildFilingCalculations(input: {
  quarterLabel: string;
  milesByJurisdiction: Record<string, number>;
  fuelByJurisdiction: Record<string, number>;
  milesOverrides?: Record<string, number>;
  fuelOverrides?: Record<string, number>;
}): IftaFilingData {
  const { year, quarter } = parseQuarterLabel(input.quarterLabel);
  const milesOverrides = input.milesOverrides ?? {};
  const fuelOverrides = input.fuelOverrides ?? {};

  const stateMiles = Object.keys({ ...input.milesByJurisdiction, ...milesOverrides }).map((state) => ({
    state,
    miles: input.milesByJurisdiction[state] ?? 0,
    override_miles: milesOverrides[state] ?? null,
  }));
  const stateGallons = Object.keys({ ...input.fuelByJurisdiction, ...fuelOverrides }).map((state) => ({
    state,
    gallons: input.fuelByJurisdiction[state] ?? 0,
    override_gallons: fuelOverrides[state] ?? null,
  }));

  const calc = calculateStateTaxes({ quarter, year, stateMiles, stateGallons });
  const jurisdiction_rows: IftaFilingJurisdictionRow[] = calc.rows.map((row) => ({
    state: row.state,
    miles: effectiveMiles(
      { miles_by_jurisdiction: input.milesByJurisdiction, miles_overrides: milesOverrides },
      row.state
    ),
    fuel_gallons: effectiveFuel(
      { fuel_by_jurisdiction: input.fuelByJurisdiction, fuel_overrides: fuelOverrides },
      row.state
    ),
    tax_rate_per_gallon: row.tax_rate_per_gallon,
    taxable_gallons: row.taxable_gallons,
    net_taxable_gallons: row.net_taxable_gallons,
    tax_owed: row.tax_owed,
  }));

  return {
    quarter_label: input.quarterLabel,
    year,
    quarter,
    miles_by_jurisdiction: input.milesByJurisdiction,
    fuel_by_jurisdiction: input.fuelByJurisdiction,
    miles_overrides: milesOverrides,
    fuel_overrides: fuelOverrides,
    jurisdiction_rows,
    fleet_mpg: calc.fleetMpg,
    total_tax_owed: calc.totalTaxOwed,
    rates_source: String(ratesMeta._source ?? "https://www.iftach.org/taxmatrix4/"),
    rates_quarter_key: `Q${quarter}-${year}`,
    prepared_at: new Date().toISOString(),
  };
}

export async function prepareFiling(
  client: Queryable,
  operatingCompanyId: string,
  quarterLabel: string,
  preparedByUserUuid: string
) {
  const milesByJurisdiction = await aggregateMilesByJurisdiction(client, operatingCompanyId, quarterLabel);
  const fuelByJurisdiction = await aggregateFuelByJurisdiction(client, operatingCompanyId, quarterLabel);
  const filingData = buildFilingCalculations({ quarterLabel, milesByJurisdiction, fuelByJurisdiction });

  const insertRes = await client.query(
    `
      INSERT INTO reports.ifta_filings (
        operating_company_id, quarter, status, filing_data, prepared_by_user_uuid
      )
      VALUES ($1::uuid, $2, 'draft', $3::jsonb, $4::uuid)
      ON CONFLICT (operating_company_id, quarter)
      DO UPDATE SET
        status = 'draft',
        filing_data = EXCLUDED.filing_data,
        prepared_by_user_uuid = EXCLUDED.prepared_by_user_uuid,
        approved_by_user_uuid = NULL,
        approved_at = NULL,
        filed_at = NULL,
        confirmation_number = NULL
      RETURNING *
    `,
    [operatingCompanyId, quarterLabel, JSON.stringify(filingData), preparedByUserUuid]
  );

  return insertRes.rows[0];
}

export async function updateFilingOverrides(
  client: Queryable,
  operatingCompanyId: string,
  filingUuid: string,
  input: { miles_overrides?: Record<string, number>; fuel_overrides?: Record<string, number> }
) {
  const existingRes = await client.query(
    `
      SELECT *
      FROM reports.ifta_filings
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [filingUuid, operatingCompanyId]
  );
  const existing = existingRes.rows[0];
  if (!existing) return null;
  if (String(existing.status) !== "draft" && String(existing.status) !== "review") {
    throw new Error("E_FILING_NOT_EDITABLE");
  }

  const prior = existing.filing_data as IftaFilingData;
  const filingData = buildFilingCalculations({
    quarterLabel: String(existing.quarter),
    milesByJurisdiction: prior.miles_by_jurisdiction ?? {},
    fuelByJurisdiction: prior.fuel_by_jurisdiction ?? {},
    milesOverrides: { ...(prior.miles_overrides ?? {}), ...(input.miles_overrides ?? {}) },
    fuelOverrides: { ...(prior.fuel_overrides ?? {}), ...(input.fuel_overrides ?? {}) },
  });

  const updateRes = await client.query(
    `
      UPDATE reports.ifta_filings
      SET filing_data = $3::jsonb,
          status = 'review'
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
      RETURNING *
    `,
    [filingUuid, operatingCompanyId, JSON.stringify(filingData)]
  );
  return updateRes.rows[0];
}

export async function ownerApproveFiling(
  client: Queryable,
  operatingCompanyId: string,
  filingUuid: string,
  approvedByUserUuid: string
) {
  const updateRes = await client.query(
    `
      UPDATE reports.ifta_filings
      SET status = 'owner_approved',
          approved_by_user_uuid = $3::uuid,
          approved_at = now()
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status IN ('draft', 'review')
      RETURNING *
    `,
    [filingUuid, operatingCompanyId, approvedByUserUuid]
  );
  const row = updateRes.rows[0];
  if (!row) return null;

  try {
    // Canonical audit sink = audit.audit_events (audit.audit_log never existed — G5).
    await client.query(
      `
        INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
        VALUES ('reports.ifta_filings.owner_approved', 'info', $1::jsonb, $2::uuid, 'reports.ifta')
      `,
      [
        JSON.stringify({ table_name: "reports.ifta_filings", record_id: filingUuid, action: "owner_approved", quarter: row.quarter, wf064: "WF-064", operating_company_id: operatingCompanyId }),
        approvedByUserUuid,
      ]
    );
  } catch {
    // audit write failure is non-fatal
  }

  return row;
}

export async function markFilingFiled(
  client: Queryable,
  operatingCompanyId: string,
  filingUuid: string,
  confirmationNumber: string,
  actorUserUuid: string
) {
  const updateRes = await client.query(
    `
      UPDATE reports.ifta_filings
      SET status = 'filed',
          filed_at = now(),
          confirmation_number = $3
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'owner_approved'
      RETURNING *
    `,
    [filingUuid, operatingCompanyId, confirmationNumber]
  );
  const row = updateRes.rows[0];
  if (!row) return null;

  try {
    // Canonical audit sink = audit.audit_events (audit.audit_log never existed — G5).
    await client.query(
      `
        INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
        VALUES ('reports.ifta_filings.filed', 'info', $1::jsonb, $2::uuid, 'reports.ifta')
      `,
      [
        JSON.stringify({ table_name: "reports.ifta_filings", record_id: filingUuid, action: "filed", quarter: row.quarter, confirmation_number: confirmationNumber, operating_company_id: operatingCompanyId }),
        actorUserUuid,
      ]
    );
  } catch {
    // audit write failure is non-fatal
  }

  return row;
}

export async function listFilings(client: Queryable, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT uuid, operating_company_id, quarter, status, filing_data, prepared_by_user_uuid,
             approved_by_user_uuid, approved_at, filed_at, confirmation_number, created_at
      FROM reports.ifta_filings
      WHERE operating_company_id = $1::uuid
      ORDER BY quarter DESC, created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function getFilingDraft(client: Queryable, operatingCompanyId: string, filingUuid: string) {
  const res = await client.query(
    `
      SELECT *
      FROM reports.ifta_filings
      WHERE uuid = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [filingUuid, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}
