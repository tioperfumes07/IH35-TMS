import type { PoolClient } from "pg";
import { asOfToday, computeDepreciationSchedule } from "../accounting/fixed-assets.math.js";

export type UnitFinanceLinkageFixedAsset = {
  id: string;
  asset_number: string | null;
  name: string;
  status: string;
  purchase_price_cents: number;
  net_book_value_cents: number;
  depreciation_to_date_cents: number;
  in_service_date: string;
  drill_to: string;
};

export type UnitFinanceLinkageLease = {
  lease_contract_id: string;
  display_id: string | null;
  election: string;
  status: string;
  commencement_date: string | null;
  end_date: string | null;
  allocated_cost_cents: number;
  fixed_asset_id: string;
  drill_to: string;
};

export type UnitFinanceLinkageEquipmentLoan = {
  id: string;
  equipment_id: string;
  equipment_number: string | null;
  lender_vendor_name: string | null;
  principal_cents: number;
  apr_percent: number;
  started_on: string;
  maturity_on: string | null;
  status: string;
  drill_to: string;
};

export type UnitFinanceLinkage = {
  unit_id: string;
  fixed_assets: UnitFinanceLinkageFixedAsset[];
  leases: UnitFinanceLinkageLease[];
  equipment_loans: UnitFinanceLinkageEquipmentLoan[];
};

function nbvFromAssetRow(row: {
  purchase_price_cents: string;
  salvage_value_cents: string;
  prior_accumulated_depr_cents: string;
  in_service_date: string;
  method: string;
  useful_life_months: number;
  convention: string;
}) {
  const compute = computeDepreciationSchedule({
    purchase_price_cents: Number(row.purchase_price_cents),
    salvage_value_cents: Number(row.salvage_value_cents),
    in_service_date: row.in_service_date,
    method: row.method,
    useful_life_months: row.useful_life_months,
    convention: row.convention,
    prior_accumulated_depr_cents: Number(row.prior_accumulated_depr_cents),
  });
  const now = asOfToday(compute.rows);
  return {
    depreciation_to_date_cents: now.depr_to_date_cents,
    net_book_value_cents: now.book_value_now_cents,
  };
}

/** READ-ONLY reverse drill-through for unit ↔ fixed asset / ASC 842 lease / equipment loan surfaces. No posting. */
export async function getUnitFinanceLinkage(
  client: PoolClient,
  operatingCompanyId: string,
  unitId: string,
): Promise<UnitFinanceLinkage | null> {
  const unitRes = await client.query<{ id: string }>(
    `SELECT id FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1`,
    [unitId, operatingCompanyId],
  );
  if (!unitRes.rows[0]) return null;

  const fixedAssetsRes = await client.query<{
    id: string;
    asset_number: string | null;
    name: string;
    status: string;
    purchase_price_cents: string;
    salvage_value_cents: string;
    prior_accumulated_depr_cents: string;
    in_service_date: string;
    method: string;
    useful_life_months: number;
    convention: string;
  }>(
    `SELECT fa.id::text, fa.asset_number, fa.name, fa.status,
            fa.purchase_price_cents::text, fa.salvage_value_cents::text,
            fa.prior_accumulated_depr_cents::text, fa.in_service_date::text,
            fa.method, fa.useful_life_months, fa.convention
       FROM accounting.fixed_assets fa
      WHERE fa.operating_company_id = $1::uuid
        AND fa.unit_uuid = $2::uuid
        AND fa.is_active = true
      ORDER BY fa.in_service_date DESC, fa.created_at DESC`,
    [operatingCompanyId, unitId],
  );

  const leasesRes = await client.query<{
    lease_contract_id: string;
    display_id: string | null;
    election: string;
    status: string;
    commencement_date: string | null;
    end_date: string | null;
    allocated_cost_cents: string;
    fixed_asset_id: string;
  }>(
    `SELECT lc.id::text AS lease_contract_id, lc.display_id, lc.election, lc.status,
            lc.commencement_date::text AS commencement_date, lc.end_date::text AS end_date,
            lal.allocated_cost_cents::text AS allocated_cost_cents,
            lal.fixed_asset_id::text AS fixed_asset_id
       FROM accounting.lease_asset_line lal
       JOIN accounting.lease_contract lc ON lc.id = lal.lease_contract_id
      WHERE lal.operating_company_id = $1::uuid
        AND lal.unit_uuid = $2::uuid
        AND lal.is_active = true
        AND lc.is_active = true
      ORDER BY lc.commencement_date DESC NULLS LAST, lal.created_at DESC`,
    [operatingCompanyId, unitId],
  );

  const equipmentLoansRes = await client.query<{
    id: string;
    equipment_id: string;
    equipment_number: string | null;
    lender_vendor_name: string | null;
    principal_cents: string;
    apr_percent: string;
    started_on: string;
    maturity_on: string | null;
    status: string;
  }>(
    `SELECT l.id::text, l.equipment_id::text, e.equipment_number,
            v.vendor_name AS lender_vendor_name,
            l.principal_cents::text, l.apr_percent::text,
            l.started_on::text, l.maturity_on::text, l.status
       FROM banking.equipment_loans l
       JOIN mdata.equipment e ON e.id = l.equipment_id
       JOIN mdata.vendors v ON v.id = l.lender_vendor_id
      WHERE l.operating_company_id = $1::uuid
        AND e.current_unit_id = $2::uuid
        AND l.status <> 'voided'
      ORDER BY l.started_on DESC, l.created_at DESC`,
    [operatingCompanyId, unitId],
  );

  return {
    unit_id: unitId,
    fixed_assets: fixedAssetsRes.rows.map((r) => {
      const nbv = nbvFromAssetRow(r);
      return {
        id: r.id,
        asset_number: r.asset_number,
        name: r.name,
        status: r.status,
        purchase_price_cents: Number(r.purchase_price_cents),
        ...nbv,
        in_service_date: r.in_service_date,
        drill_to: "/accounting/fixed-assets",
      };
    }),
    leases: leasesRes.rows.map((r) => ({
      lease_contract_id: r.lease_contract_id,
      display_id: r.display_id,
      election: r.election,
      status: r.status,
      commencement_date: r.commencement_date,
      end_date: r.end_date,
      allocated_cost_cents: Number(r.allocated_cost_cents),
      fixed_asset_id: r.fixed_asset_id,
      drill_to: "/finance/hub",
    })),
    equipment_loans: equipmentLoansRes.rows.map((r) => ({
      id: r.id,
      equipment_id: r.equipment_id,
      equipment_number: r.equipment_number,
      lender_vendor_name: r.lender_vendor_name,
      principal_cents: Number(r.principal_cents),
      apr_percent: Number(r.apr_percent),
      started_on: r.started_on,
      maturity_on: r.maturity_on,
      status: r.status,
      drill_to: "/factoring/equipment-loans",
    })),
  };
}
