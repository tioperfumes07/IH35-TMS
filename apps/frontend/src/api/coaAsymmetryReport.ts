import { apiRequest } from "./client";

export type CoaAsymmetryEntityCounts = {
  entity_code: string;
  postable: number;
  total_active: number;
};

export type CoaAsymmetryTypeBreakdown = {
  account_type: string;
  trk_only_postable: number;
};

export type CoaAsymmetrySampleRow = {
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
    trk_postable_absent_on_transp: number;
    transp_postable_absent_on_trk: number;
  };
  trk_only_postable_by_type: CoaAsymmetryTypeBreakdown[];
  sample_trk_only_postable: CoaAsymmetrySampleRow[];
};

/** Read-only grouped diff — never mutates catalogs.accounts (Rule 19). */
export function getCoaAsymmetryReport() {
  return apiRequest<CoaAsymmetryReport>("/api/v1/accounting/coa-asymmetry-report");
}
