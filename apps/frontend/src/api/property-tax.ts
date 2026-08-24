// Business-Property Allocation — TX business personal-property tax rendition (filing side) API client.
import { apiRequest } from "./client";

export type RenditionStatus = "draft" | "filed" | "appealed" | "settled";
export type ValueBasis = "historical_cost" | "market_value" | "depreciated_cost";

export type AppraisalDistrict = {
  id: string;
  state: string;
  county: string;
  cad_name: string;
  is_active: boolean;
};

export type Rendition = {
  id: string;
  operating_company_id: string;
  tax_year: number;
  appraisal_district_id: string;
  cad_name: string;
  county: string;
  status: RenditionStatus;
  value_basis: ValueBasis;
  due_date: string;
  extension_requested: boolean;
  extended_due_date: string | null;
  effective_due_date: string;
  cad_account_number: string | null;
  total_rendered_value_cents: number;
  assessed_tax_cents: number | null;
  filed_at: string | null;
  notes: string | null;
};

export type RenditionLine = {
  id: string;
  rendition_id: string;
  unit_id: string | null;
  equipment_id: string | null;
  fixed_asset_id: string | null;
  asset_description: string;
  asset_category: string | null;
  acquisition_date: string | null;
  acquisition_cost_cents: number | null;
  rendered_value_cents: number;
};

export type CandidateAsset = {
  kind: "unit" | "equipment";
  id: string;
  label: string;
  vin: string | null;
  acquired_date: string | null;
};

const q = (cid: string) => `operating_company_id=${encodeURIComponent(cid)}`;

export function fetchAppraisalDistricts(cid: string) {
  return apiRequest<{ districts: AppraisalDistrict[] }>(`/api/v1/compliance/property-tax/appraisal-districts?${q(cid)}`);
}

export function createAppraisalDistrict(cid: string, body: { state?: string; county: string; cad_name: string }) {
  return apiRequest<{ district: AppraisalDistrict }>(`/api/v1/compliance/property-tax/appraisal-districts`, {
    method: "POST",
    body: { operating_company_id: cid, ...body },
  });
}

export function fetchCandidateAssets(cid: string) {
  return apiRequest<{ assets: CandidateAsset[] }>(`/api/v1/compliance/property-tax/candidate-assets?${q(cid)}`);
}

export function fetchRenditions(cid: string, unitId?: string) {
  const unit = unitId ? `&unit_id=${encodeURIComponent(unitId)}` : "";
  return apiRequest<{ renditions: Rendition[] }>(`/api/v1/compliance/property-tax/renditions?${q(cid)}${unit}`);
}

export function fetchRendition(cid: string, id: string) {
  return apiRequest<{ rendition: Rendition; lines: RenditionLine[] }>(
    `/api/v1/compliance/property-tax/renditions/${id}?${q(cid)}`
  );
}

/** BUSINESS-PROPERTY-ALLOCATION-PRINT: canonical letter HTML path, for openPrintableDocument. */
export function renditionPrintPath(cid: string, id: string) {
  return `/api/v1/compliance/property-tax/renditions/${id}.html?${q(cid)}`;
}

export function createRendition(
  cid: string,
  body: { tax_year: number; appraisal_district_id: string; value_basis?: ValueBasis; cad_account_number?: string | null; notes?: string | null }
) {
  return apiRequest<{ rendition: Rendition }>(`/api/v1/compliance/property-tax/renditions`, {
    method: "POST",
    body: { operating_company_id: cid, ...body },
  });
}

export function updateRendition(
  cid: string,
  id: string,
  patch: Partial<{
    status: RenditionStatus;
    value_basis: ValueBasis;
    extension_requested: boolean;
    extended_due_date: string | null;
    cad_account_number: string | null;
    assessed_tax_cents: number | null;
    notes: string | null;
  }>
) {
  return apiRequest<{ rendition: Rendition }>(`/api/v1/compliance/property-tax/renditions/${id}`, {
    method: "PATCH",
    body: { operating_company_id: cid, ...patch },
  });
}

export function addRenditionLine(
  cid: string,
  id: string,
  line: {
    unit_id?: string | null;
    equipment_id?: string | null;
    fixed_asset_id?: string | null;
    asset_description: string;
    asset_category?: string | null;
    acquisition_date?: string | null;
    acquisition_cost_cents?: number | null;
    rendered_value_cents?: number;
  }
) {
  return apiRequest<{ line: RenditionLine }>(`/api/v1/compliance/property-tax/renditions/${id}/lines`, {
    method: "POST",
    body: { operating_company_id: cid, ...line },
  });
}
