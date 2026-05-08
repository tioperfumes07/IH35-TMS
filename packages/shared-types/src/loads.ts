export type LoadLifecycleStage =
  | "pre_trip"
  | "en_route_pickup"
  | "at_shipper"
  | "loading"
  | "loaded"
  | "en_route_delivery"
  | "at_receiver"
  | "unloading"
  | "unloaded"
  | "detention"
  | "hos_break"
  | "off_duty"
  | "accident"
  | "breakdown"
  | "no_gps";

export type StopType = "pickup" | "delivery" | "fuel" | "break";
export type StopStatus = "pending" | "arrived" | "loading" | "loaded" | "departed";

export type DriverStop = {
  id: string;
  sequence: number;
  type: StopType;
  location_name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  scheduled_arrival_at: string;
  scheduled_departure_at: string;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: StopStatus;
  notes: string | null;
};

export type DriverLoad = {
  id: string;
  display_id: string;
  customer_name: string;
  pickup_location: string;
  delivery_location: string;
  pickup_at: string;
  delivery_at: string;
  miles: number;
  rate_cents: number;
  equipment: string;
  dispatcher_name: string;
  dispatcher_phone: string | null;
  lifecycle_stage: LoadLifecycleStage;
  current_stop_index: number;
  stops: DriverStop[];
  accepted_at: string | null;
  rate_confirmation_html: string;
};

export type AcceptanceRequest = {
  load_id: string;
  signature_data_url: string;
  geo_lat: number;
  geo_lng: number;
  geo_accuracy_m: number;
  scroll_completed: boolean;
  accepted_at: string;
};
