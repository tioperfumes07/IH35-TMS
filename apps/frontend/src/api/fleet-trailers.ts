import { apiRequest } from "./client";

export type TrailerStatus =
  | "InService"
  | "OutOfService"
  | "InMaintenance"
  | "Sold"
  | "Lost"
  | "Damaged"
  | "Transferred";

export function putTrailerStatus(
  trailerId: string,
  operatingCompanyId: string,
  body: {
    status: TrailerStatus;
    reason: string;
    note?: string;
    effective_date?: string;
    admin_override?: boolean;
    sold_date?: string;
    sold_to?: string;
    sold_price?: number;
    transferred_date?: string;
    transferred_to_entity?: "TRK" | "TRANSP" | "USMCA";
    damage_date?: string;
    damage_description?: string;
    oos_date?: string;
    oos_reason?: string;
  }
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/fleet/trailers/${trailerId}/status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PUT", body }
  );
}

export function patchTrailer(
  trailerId: string,
  operatingCompanyId: string,
  body: Record<string, unknown>
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/fleet/trailers/${trailerId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body }
  );
}
