import { apiRequest } from "./client";

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
