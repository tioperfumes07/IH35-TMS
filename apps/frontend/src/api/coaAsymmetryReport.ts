import { apiRequest } from "./client";

export type CoaAsymmetryEntityCounts = {
  entity_code: string;
  postable: number;
  total_active: number;
};

export type CoaAsymmetryTypeBreakdown = {
  account_type: string;
  count: number;
};

export type CoaAsymmetrySampleRow = {
  account_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  entity_code: string;
};

export type CoaAsymmetryReport = {
  read_only: true;
  disclaimer: string;
  generated_at: string;
  entity_codes: readonly string[];
  postable_by_entity: CoaAsymmetryEntityCounts[];
  diff_summary: {
    active_only_postable: number;
    frozen_absent_on_active: number;
  };
  active_only_by_type: CoaAsymmetryTypeBreakdown[];
  sample_active_only: CoaAsymmetrySampleRow[];
};

/** Read-only grouped diff — never mutates catalogs.accounts (Rule 19). */
export function getCoaAsymmetryReport(operatingCompanyId: string) {
  return apiRequest<CoaAsymmetryReport>(
    `/api/v1/accounting/coa-asymmetry-report?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
