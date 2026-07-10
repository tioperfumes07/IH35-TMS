import { apiRequest } from "./client";

export type DriverMapCandidate = { samsara_driver_id: string; samsara_name: string | null; basis: "license" | "phone" | "name" };
export type DriverMapRow = {
  local_driver_id: string;
  driver_name: string;
  cdl_number: string | null;
  phone: string | null;
  current_samsara_driver_id: string | null;
  proposed_samsara_driver_id: string | null;
  samsara_name: string | null;
  confidence: "high" | "low" | "none";
  match_basis: "license" | "phone" | "name" | null;
  ambiguous: boolean;
  candidates: DriverMapCandidate[];
};
export type DriverMapPreview = {
  operating_company_id: string;
  generated_at: string;
  our_active_drivers: number;
  samsara_roster: number;
  counts: { matched_high: number; matched_low: number; ambiguous: number; unmatched: number; already_mapped: number };
  id_reconcile: { stored_matches_proposed: number; stored_differs_from_proposed: number; stored_but_no_roster_match: number; both_null: number };
  downstream: {
    active_driver_query_count: number;
    open_vehicle_driver_assignments: number;
    linked_samsara_drivers: number;
    last_hos_clocks_pull: { finished_at: string; success: boolean; error_message: string | null; rows_added: number } | null;
  };
  rows: DriverMapRow[];
};

export function fetchHosDriverMapPreview(operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<DriverMapPreview>(`/api/v1/telematics/hos-driver-map/preview?${qs.toString()}`);
}

export type LatestUnitPosition = {
  unit_id: string;
  unit_number: string | null;
  samsara_vehicle_id: string;
  captured_at: string;
  lat: number;
  lng: number;
  speed_mph: number | null;
  heading_deg: number | null;
  engine_state: "on" | "off" | "idle" | "unknown";
};

export function listLatestPositions(operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ rows: LatestUnitPosition[] }>(`/api/v1/telematics/positions/latest?${qs.toString()}`);
}
