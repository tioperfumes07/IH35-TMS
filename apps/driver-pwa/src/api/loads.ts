import { enqueueUpload, type UploadQueueItem } from "../lib/upload-queue";

// TODO: extract Load + LoadStop types to packages/shared-types
// in P3-T11.15.4 cleanup. For now duplicated from office.
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

function rateConfStubHtml(load: DriverLoad): string {
  const repeated = Array.from({ length: 200 }, (_, index) => `<p>Clause ${index + 1}: Driver agrees to transport load ${load.display_id} under customer and carrier operating terms.</p>`).join("");
  return `<div><h2>Rate Confirmation ${load.display_id}</h2><p>Customer: ${load.customer_name}</p>${repeated}</div>`;
}

function buildStubLoads(): DriverLoad[] {
  const now = Date.now();
  const loadA: DriverLoad = {
    id: "load-1001",
    display_id: "LD-1001",
    customer_name: "Atlas Cold Chain",
    pickup_location: "Houston, TX",
    delivery_location: "Atlanta, GA",
    pickup_at: new Date(now + 45 * 60 * 1000).toISOString(),
    delivery_at: new Date(now + 28 * 60 * 60 * 1000).toISOString(),
    miles: 793,
    rate_cents: 295000,
    equipment: "53' Reefer",
    dispatcher_name: "Sofia Reyes",
    dispatcher_phone: "+17135550192",
    lifecycle_stage: "pre_trip",
    current_stop_index: 0,
    accepted_at: null,
    rate_confirmation_html: "",
    stops: [
      {
        id: "stop-1001-pu",
        sequence: 1,
        type: "pickup",
        location_name: "Atlas Distribution Hub",
        address: "812 Port Logistics Dr",
        city: "Houston",
        state: "TX",
        lat: 29.7343,
        lng: -95.2426,
        geofence_radius_m: 40233.6,
        scheduled_arrival_at: new Date(now + 45 * 60 * 1000).toISOString(),
        scheduled_departure_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        actual_arrival_at: null,
        actual_departure_at: null,
        status: "pending",
        notes: null,
      },
      {
        id: "stop-1001-del",
        sequence: 2,
        type: "delivery",
        location_name: "Metro Retail DC",
        address: "2250 Commerce Pkwy",
        city: "Atlanta",
        state: "GA",
        lat: 33.7946,
        lng: -84.4208,
        geofence_radius_m: 32186.88,
        scheduled_arrival_at: new Date(now + 27 * 60 * 60 * 1000).toISOString(),
        scheduled_departure_at: new Date(now + 28 * 60 * 60 * 1000).toISOString(),
        actual_arrival_at: null,
        actual_departure_at: null,
        status: "pending",
        notes: null,
      },
    ],
  };
  loadA.rate_confirmation_html = rateConfStubHtml(loadA);

  const loadB: DriverLoad = {
    id: "load-1002",
    display_id: "LD-1002",
    customer_name: "Summit Freight Brokers",
    pickup_location: "Dallas, TX",
    delivery_location: "Phoenix, AZ",
    pickup_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    delivery_at: new Date(now + 18 * 60 * 60 * 1000).toISOString(),
    miles: 1065,
    rate_cents: 341500,
    equipment: "53' Dry Van",
    dispatcher_name: "Daniel Clark",
    dispatcher_phone: "+12145550110",
    lifecycle_stage: "en_route_delivery",
    current_stop_index: 1,
    accepted_at: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
    rate_confirmation_html: "",
    stops: [
      {
        id: "stop-1002-pu",
        sequence: 1,
        type: "pickup",
        location_name: "Summit Export Yard",
        address: "1400 Trinity St",
        city: "Dallas",
        state: "TX",
        lat: 32.7811,
        lng: -96.7954,
        geofence_radius_m: 40233.6,
        scheduled_arrival_at: new Date(now - 9 * 60 * 60 * 1000).toISOString(),
        scheduled_departure_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
        actual_arrival_at: new Date(now - 9 * 60 * 60 * 1000).toISOString(),
        actual_departure_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
        status: "departed",
        notes: null,
      },
      {
        id: "stop-1002-fuel",
        sequence: 2,
        type: "fuel",
        location_name: "Pilot #492",
        address: "4400 I-20 Service Rd",
        city: "Abilene",
        state: "TX",
        lat: 32.4487,
        lng: -99.7172,
        geofence_radius_m: 8046.72,
        scheduled_arrival_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        scheduled_departure_at: new Date(now - 90 * 60 * 1000).toISOString(),
        actual_arrival_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        actual_departure_at: null,
        status: "arrived",
        notes: "Fuel + scale",
      },
      {
        id: "stop-1002-del",
        sequence: 3,
        type: "delivery",
        location_name: "Phoenix Regional Receiver",
        address: "85 Desert Logistics Way",
        city: "Phoenix",
        state: "AZ",
        lat: 33.4511,
        lng: -112.0737,
        geofence_radius_m: 32186.88,
        scheduled_arrival_at: new Date(now + 16 * 60 * 60 * 1000).toISOString(),
        scheduled_departure_at: new Date(now + 18 * 60 * 60 * 1000).toISOString(),
        actual_arrival_at: null,
        actual_departure_at: null,
        status: "pending",
        notes: null,
      },
    ],
  };
  loadB.rate_confirmation_html = rateConfStubHtml(loadB);

  return [loadA, loadB];
}

// TODO: wire to /api/driver/loads/today in P3-T11.15.4
export async function getMyLoadsToday(): Promise<DriverLoad[]> {
  return buildStubLoads();
}

// TODO: wire to /api/driver/loads/:id in P3-T11.15.4
export async function getLoadDetail(id: string): Promise<DriverLoad> {
  const loads = await getMyLoadsToday();
  const found = loads.find((load) => load.id === id);
  if (!found) throw new Error(`Load not found: ${id}`);
  return found;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(",");
  const contentType = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const binary = atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

// TODO: wire to /api/driver/loads/:id/accept in P3-T11.15.4
export async function acceptLoad(req: AcceptanceRequest): Promise<void> {
  const payloadBlob = dataUrlToBlob(req.signature_data_url);
  const queueItem: UploadQueueItem = {
    id: `accept-${req.load_id}-${Date.now()}`,
    file_blob: payloadBlob,
    mime_type: payloadBlob.type || "image/png",
    original_filename: `${req.load_id}-acceptance.png`,
    size_bytes: payloadBlob.size,
    category_id: null,
    entity_type: "load",
    entity_id: req.load_id,
    document_date: req.accepted_at.slice(0, 10),
    expiration_date: null,
    description: JSON.stringify({
      kind: "driver_load_acceptance",
      geo_lat: req.geo_lat,
      geo_lng: req.geo_lng,
      geo_accuracy_m: req.geo_accuracy_m,
      scroll_completed: req.scroll_completed,
      accepted_at: req.accepted_at,
    }),
    retry_count: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    status: "pending",
    next_retry_at: null,
  };
  await enqueueUpload(queueItem);
  // Real endpoint lands in T11.15.4. For v1 stub acceptLoad logs + enqueues + returns success after 500ms.
  // eslint-disable-next-line no-console
  console.info("acceptLoad(stub)", req);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// TODO: wire to /api/driver/loads/:id/stops/:stopId/arrive in P3-T11.15.4
export async function markStopArrived(loadId: string, stopId: string, geo: { lat: number; lng: number; accuracy_m: number }): Promise<void> {
  // eslint-disable-next-line no-console
  console.info("markStopArrived(stub)", { loadId, stopId, geo });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// TODO: wire to /api/driver/loads/:id/stops/:stopId/depart in P3-T11.15.4
export async function markStopDeparted(loadId: string, stopId: string, geo: { lat: number; lng: number; accuracy_m: number }): Promise<void> {
  // eslint-disable-next-line no-console
  console.info("markStopDeparted(stub)", { loadId, stopId, geo });
  await new Promise((resolve) => setTimeout(resolve, 300));
}
