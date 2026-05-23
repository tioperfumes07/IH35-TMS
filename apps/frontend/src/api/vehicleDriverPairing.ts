import { apiRequest } from "./client";

export type VehicleDriverHistoryRow = {
  id: string;
  unit_id: string;
  unit_number: string;
  driver_id: string | null;
  driver_name: string | null;
  started_at: string;
  ended_at: string | null;
  source: "samsara_webhook" | "manual_override" | "reconciled";
};

export function listVehicleDriverHistory(params: {
  operating_company_id: string;
  unit_id?: string;
  driver_id?: string;
  days?: number;
}) {
  const query = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.unit_id) query.set("unit_id", params.unit_id);
  if (params.driver_id) query.set("driver_id", params.driver_id);
  if (typeof params.days === "number") query.set("days", String(params.days));
  return apiRequest<{ rows: VehicleDriverHistoryRow[] }>(`/api/v1/telematics/vehicle-driver-history?${query.toString()}`);
}
