import { apiRequest } from "./client";

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

export function getUnitFinanceLinkage(unitId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<UnitFinanceLinkage>(`/api/v1/mdata/units/${unitId}/finance-linkage?${q}`);
}
