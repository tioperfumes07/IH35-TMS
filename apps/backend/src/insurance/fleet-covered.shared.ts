import { excludeInsuranceFixtureSql } from "./insurance-visibility.js";
import { excludeDemoPhantomSql } from "../mdata/fleet-visibility.js";

/**
 * GO-03 — one company-scoped read model for the Fleet Covered tab. Premium and TIV are
 * read from policy_unit, never recomputed from policy totals in the browser. One asset
 * stays one row even when it carries several coverage types.
 */
export const FLEET_COVERED_SQL = `
  SELECT
    a.id::text AS asset_id,
    a.unit_id::text AS unit_id,
    a.equipment_id::text AS equipment_id,
    a.unit_code AS unit_number,
    CASE WHEN a.asset_type = 'tractor' THEN 'tractor' ELSE 'trailer' END AS vehicle_type,
    a.asset_type AS vehicle_class,
    a.year,
    a.make,
    a.model,
    a.vin,
    a.status,
    MAX(pu.insured_value_cents) FILTER (WHERE p.id IS NOT NULL)::bigint AS insured_value_cents,
    COALESCE(SUM(pu.cost_per_month_cents) FILTER (WHERE p.id IS NOT NULL), 0)::bigint AS premium_per_month_cents,
    MIN(p.effective_date)::text AS covered_since,
    jsonb_agg(
      jsonb_build_object(
        'coverage_type', p.coverage_type,
        'policy_id', p.id::text,
        'policy_number', p.policy_number,
        'expiry_date', p.expiry_date::text,
        'allocation_method', p.allocation_method
      ) ORDER BY p.coverage_type
    ) FILTER (WHERE p.id IS NOT NULL) AS coverages
  FROM mdata.assets a
  LEFT JOIN insurance.policy_unit pu
    ON pu.asset_id = a.id
   AND pu.tenant_id = a.tenant_id
   AND pu.removed_at IS NULL
  LEFT JOIN insurance.policy p
    ON p.id = pu.policy_id
   AND p.tenant_id = pu.tenant_id
   AND p.status = 'active'
   AND p.effective_date <= now()::date
   AND p.expiry_date >= now()::date
   AND ${excludeInsuranceFixtureSql("p.policy_number")}
  WHERE a.tenant_id = $1::uuid
    AND a.status NOT IN ('sold', 'retired')
    AND a.asset_type IN ('tractor', 'dry_van', 'reefer', 'flatbed')
    AND a.unit_code <> 'T144'
    AND ${excludeDemoPhantomSql("a.unit_code")}
  GROUP BY a.id, a.unit_id, a.equipment_id, a.unit_code, a.asset_type,
           a.year, a.make, a.model, a.vin, a.status
  ORDER BY a.unit_code ASC
`;

export type FleetCoveredCoverage = {
  coverage_type: string;
  policy_id: string;
  policy_number: string;
  expiry_date: string;
  allocation_method: string;
};

export type FleetCoveredRow = {
  asset_id: string;
  unit_id: string | null;
  equipment_id: string | null;
  unit_number: string;
  vehicle_type: "tractor" | "trailer";
  vehicle_class: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  status: string;
  insured_value_cents: number | string | null;
  premium_per_month_cents: number | string;
  covered_since: string | null;
  coverages: FleetCoveredCoverage[] | null;
};
