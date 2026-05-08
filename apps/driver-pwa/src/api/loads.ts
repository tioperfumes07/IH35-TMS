import type { AcceptanceRequest, DriverLoad } from "@ih35/shared-types";
import { apiRequest } from "./client";
export type {
  LoadLifecycleStage,
  StopType,
  StopStatus,
  DriverStop,
  DriverLoad,
  AcceptanceRequest,
} from "@ih35/shared-types";

export async function getMyLoadsToday(): Promise<DriverLoad[]> {
  return apiRequest<DriverLoad[]>("/api/v1/driver/loads");
}

export async function getLoadDetail(id: string): Promise<DriverLoad> {
  return apiRequest<DriverLoad>(`/api/v1/driver/loads/${encodeURIComponent(id)}`);
}

export async function acceptLoad(req: AcceptanceRequest): Promise<void> {
  await apiRequest<{ acceptance_id: string }>(`/api/v1/driver/loads/${encodeURIComponent(req.load_id)}/accept`, {
    method: "POST",
    body: req,
  });
}

export async function markStopArrived(loadId: string, stopId: string, geo: { lat: number; lng: number; accuracy_m: number }): Promise<void> {
  await apiRequest<{ lifecycle_stage: string }>(
    `/api/v1/driver/loads/${encodeURIComponent(loadId)}/stops/${encodeURIComponent(stopId)}/arrive`,
    {
      method: "POST",
      body: {
        geo_lat: geo.lat,
        geo_lng: geo.lng,
        geo_accuracy_m: geo.accuracy_m,
      },
    }
  );
}

export async function markStopDeparted(loadId: string, stopId: string, geo: { lat: number; lng: number; accuracy_m: number }): Promise<void> {
  await apiRequest<{ lifecycle_stage: string }>(
    `/api/v1/driver/loads/${encodeURIComponent(loadId)}/stops/${encodeURIComponent(stopId)}/depart`,
    {
      method: "POST",
      body: {
        geo_lat: geo.lat,
        geo_lng: geo.lng,
        geo_accuracy_m: geo.accuracy_m,
      },
    }
  );
}
