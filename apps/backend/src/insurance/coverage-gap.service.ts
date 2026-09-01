import type { InsuranceCoverageType } from "./policy.shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

export const DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES: InsuranceCoverageType[] = [
  "auto_liability",
  "physical_damage",
  "cargo",
];

/**
 * GO-02: auto_liability (bodily injury/property damage from OPERATING a vehicle on the road) is
 * physically a power-unit coverage — a trailer is never itself driven, it is towed under the
 * TOWING tractor's own auto_liability policy. mdata.assets.asset_type values that are trailer
 * sub-types (see the CHECK constraint: tractor/dry_van/reefer/flatbed/personnel_vehicle/other)
 * must not be flagged as having an auto_liability "gap" -- that coverage was never required of
 * them in the first place, not merely missing. personnel_vehicle and other stay on the full
 * dispatch-required list (a personnel vehicle IS independently road-operated); do not widen this
 * exemption to asset types not asked for.
 */
const TRAILER_ASSET_TYPES = new Set(["dry_van", "reefer", "flatbed"]);

export function requiredCoverageTypesForAssetType(
  assetType: string | null | undefined,
  base: InsuranceCoverageType[] = DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES
): InsuranceCoverageType[] {
  if (assetType && TRAILER_ASSET_TYPES.has(assetType)) {
    return base.filter((type) => type !== "auto_liability");
  }
  return [...base];
}

type CoveragePolicyRow = {
  policy_id: string;
  coverage_type: string;
  status: string;
  effective_date: string;
  expiry_date: string;
};

export type AssetCoverageGapResult = {
  asset_exists: boolean;
  as_of_date: string;
  required_types: InsuranceCoverageType[];
  covered_types: InsuranceCoverageType[];
  gap_types: InsuranceCoverageType[];
  active_policy_ids: string[];
  is_covered: boolean;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function toIsoDateOnly(input?: string) {
  if (!input) return companyBusinessDate();
  return input.slice(0, 10);
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeCoverageType(value: string): InsuranceCoverageType | null {
  if (DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES.includes(value as InsuranceCoverageType)) {
    return value as InsuranceCoverageType;
  }
  return null;
}

export function buildAssetCoverageGapResult(
  rows: CoveragePolicyRow[],
  options?: {
    asOfDate?: string;
    requiredTypes?: InsuranceCoverageType[];
    assetExists?: boolean;
  }
): AssetCoverageGapResult {
  const asOfDate = toIsoDateOnly(options?.asOfDate);
  const targetDate = asDate(asOfDate);
  const requiredTypes = [...(options?.requiredTypes ?? DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES)];
  const covered = new Set<InsuranceCoverageType>();
  const activePolicyIds = new Set<string>();

  for (const row of rows) {
    if (String(row.status).toLowerCase() !== "active") continue;
    const effectiveDate = asDate(row.effective_date);
    const expiryDate = asDate(row.expiry_date);
    if (Number.isNaN(effectiveDate.getTime()) || Number.isNaN(expiryDate.getTime())) continue;
    if (effectiveDate > targetDate || expiryDate < targetDate) continue;

    const normalized = normalizeCoverageType(String(row.coverage_type));
    if (!normalized) continue;
    covered.add(normalized);
    activePolicyIds.add(String(row.policy_id));
  }

  const coveredTypes = requiredTypes.filter((type) => covered.has(type));
  const gapTypes = requiredTypes.filter((type) => !covered.has(type));

  return {
    asset_exists: options?.assetExists ?? true,
    as_of_date: asOfDate,
    required_types: requiredTypes,
    covered_types: coveredTypes,
    gap_types: gapTypes,
    active_policy_ids: [...activePolicyIds],
    is_covered: gapTypes.length === 0,
  };
}

export async function detectAssetCoverageGap(
  client: Queryable,
  input: {
    operatingCompanyId: string;
    assetId: string;
    asOfDate?: string;
    requiredTypes?: InsuranceCoverageType[];
  }
): Promise<AssetCoverageGapResult> {
  const assetRes = await client.query<{ id: string; asset_type: string | null }>(
    `
      SELECT id::text, asset_type::text
      FROM mdata.assets
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [input.operatingCompanyId, input.assetId]
  );

  if (!assetRes.rows[0]) {
    return buildAssetCoverageGapResult([], {
      asOfDate: input.asOfDate,
      requiredTypes: input.requiredTypes,
      assetExists: false,
    });
  }

  // Caller-supplied requiredTypes wins outright (explicit intent); otherwise derive from the
  // asset's own type so a trailer never shows a false auto_liability gap by default.
  const requiredTypes = input.requiredTypes ?? requiredCoverageTypesForAssetType(assetRes.rows[0].asset_type);

  const coverageRes = await client.query<CoveragePolicyRow>(
    `
      SELECT
        p.id::text AS policy_id,
        p.coverage_type::text AS coverage_type,
        p.status::text AS status,
        p.effective_date::text AS effective_date,
        p.expiry_date::text AS expiry_date
      FROM insurance.policy_unit pu
      JOIN insurance.policy p
        ON p.id = pu.policy_id
       AND p.tenant_id = pu.tenant_id
      WHERE pu.tenant_id = $1::uuid
        AND pu.asset_id = $2::uuid
    `,
    [input.operatingCompanyId, input.assetId]
  );

  return buildAssetCoverageGapResult(coverageRes.rows, {
    asOfDate: input.asOfDate,
    requiredTypes,
    assetExists: true,
  });
}
