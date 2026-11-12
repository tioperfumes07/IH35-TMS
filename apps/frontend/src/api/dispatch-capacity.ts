import { apiRequest } from "./client";

/** CAPACITY ENGINE (spec 11-10) — Dispatch › Available Trucks. Mirrors apps/backend/src/dispatch/capacity/*. */
export type CapacitySource = "actual" | "appointment" | "scheduled" | "gps";

export type CapacityRow = {
  unit_id: string;
  unit_number: string;
  driver_id?: string | null;
  driver_name: string | null;
  equipment: string | null;
  equipment_source: "next_load" | "last_load" | null;
  available_city: string | null;
  available_state: string | null;
  available_at: string | null;
  source: CapacitySource | null;
  reason: string | null;
  last_load_id: string | null;
  last_load_number: string | null;
  open_load_count: number;
  offer_enabled: boolean;
  off_reason_code: string | null;
  offerable: boolean;
};

export type BoardStatus = { board: "dat" | "truckstop"; connected: boolean; reason: string | null };
export type CapacitySettings = { send_truck_offers: boolean; reply_to_email: string | null };

export type CapacityResponse = {
  rows: CapacityRow[];
  settings: CapacitySettings;
  recipient_count: number;
  boards: BoardStatus[];
  generated_at: string;
};

export type OfferTruck = { unit_id: string; unit_number: string; city: string; state: string; available_at: string; equipment: string };

export type CapacityPreview = {
  kind: "morning" | "change";
  send_date: string;
  switch_on: boolean;
  recipient_count: number;
  emails: Array<{ to: string; contact_name: string | null; customer_name: string | null; subject: string; trucks: OfferTruck[]; html: string | null }>;
  blockers: string[];
};

export function getCapacity(operatingCompanyId: string) {
  return apiRequest<CapacityResponse>(`/api/v1/dispatch/capacity?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function getCapacityPreview(operatingCompanyId: string, kind: "morning" | "change") {
  return apiRequest<CapacityPreview>(
    `/api/v1/dispatch/capacity/preview?operating_company_id=${encodeURIComponent(operatingCompanyId)}&kind=${kind}`
  );
}

export function setUnitOffer(operatingCompanyId: string, unitId: string, offerEnabled: boolean, reasonCode: string | null) {
  return apiRequest<{ offer: { unit_id: string; offer_enabled: boolean; off_reason_code: string | null } }>(
    `/api/v1/dispatch/capacity/units/${encodeURIComponent(unitId)}/offer`,
    { method: "PUT", body: { operating_company_id: operatingCompanyId, offer_enabled: offerEnabled, reason_code: reasonCode } }
  );
}

export function updateCapacitySettings(operatingCompanyId: string, patch: Partial<CapacitySettings>) {
  return apiRequest<{ settings: CapacitySettings }>(`/api/v1/dispatch/capacity/settings`, {
    method: "PUT",
    body: { operating_company_id: operatingCompanyId, ...patch },
  });
}
