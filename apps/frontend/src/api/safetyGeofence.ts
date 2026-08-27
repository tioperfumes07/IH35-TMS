import { apiRequest } from "./client";

export type GeofenceBreachFilter = "active" | "acknowledged" | "all";

export type GeofenceBreachEvent = {
  id: string;
  operating_company_id: string;
  vehicle_id: string;
  unit_number: string | null;
  geofence_id: string;
  geofence_label: string | null;
  customer_id: string | null;
  customer_name: string | null;
  event_type: "entry" | "exit";
  event_at: string;
  position_lat: number;
  position_lng: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
};

export function listGeofenceBreaches(args: {
  operating_company_id: string;
  from?: string;
  to?: string;
  filter?: GeofenceBreachFilter;
  page_size?: number;
  offset?: number;
}) {
  const query = new URLSearchParams({
    operating_company_id: args.operating_company_id,
    filter: args.filter ?? "all",
  });
  if (args.from) query.set("from", args.from);
  if (args.to) query.set("to", args.to);
  if (args.page_size != null) query.set("page_size", String(args.page_size));
  if (args.offset != null) query.set("offset", String(args.offset));
  return apiRequest<{ events: GeofenceBreachEvent[]; total_count: number; active_count: number; active_vehicle_ids: string[]; from: string; to: string; filter: GeofenceBreachFilter; page_size: number; offset: number }>(
    `/api/v1/safety/geofence-breaches?${query.toString()}`
  );
}

export function acknowledgeBreach(id: string, operating_company_id: string) {
  return apiRequest<GeofenceBreachEvent>(`/api/v1/safety/geofence-breaches/${id}/acknowledge`, {
    method: "POST",
    body: { operating_company_id },
  });
}
