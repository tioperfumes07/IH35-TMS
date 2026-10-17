import { apiRequest } from "./client";

export type LocationRow = {
  id: string;
  location_name: string;
  location_code: string | null;
  location_type: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  geocoding_source: string | null;
  deactivated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  geofence_count: number;
  has_active_geofence: boolean;
  geofence_radius_meters: number | null;
  landmark_count: number;
  load_count: number;
  last_used_at: string | null;
};

export type LocationsListPayload = {
  rows: LocationRow[];
  count: number;
};

export type MdataLocation = {
  id: string;
  name: string;
  location_code: string | null;
  location_type: string;
  linked_customer_id: string | null;
  linked_vendor_id: string | null;
  operating_company_id: string;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export function listLocations(
  params: {
    status?: string;
    search?: string;
    operating_company_id?: string | null;
    limit?: number;
    offset?: number;
    location_type?: string;
    city?: string;
    state?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.location_type) query.set("location_type", params.location_type);
  if (params.city) query.set("city", params.city);
  if (params.state) query.set("state", params.state);
  const qs = query.toString();
  return apiRequest<{ locations: MdataLocation[] }>(`/api/v1/mdata/locations${qs ? `?${qs}` : ""}`);
}

export async function getLocationsList(
  operatingCompanyId: string,
  filters?: {
    search?: string;
    state?: string;
    geocoded?: boolean;
    geofence?: boolean;
    source?: string;
  }
): Promise<LocationsListPayload> {
  const params = new URLSearchParams();
  if (filters?.search) params.append("search", filters.search);
  if (filters?.state) params.append("state", filters.state);
  if (filters?.geocoded !== undefined) params.append("geocoded", String(filters.geocoded));
  if (filters?.geofence !== undefined) params.append("geofence", String(filters.geofence));
  if (filters?.source) params.append("source", filters.source);
  const qs = params.toString();
  return apiRequest<LocationsListPayload>(
    `/api/v1/lists/locations?operating_company_id=${operatingCompanyId}${qs ? "&" + qs : ""}`
  );
}
