import { apiRequest } from "./client";

export type PodCapturePayload = {
  photo_base64?: string;
  signature_base64: string;
  recipient_name?: string;
  notes?: string;
};

export async function submitPodCapture(loadId: string, stopId: string, body: PodCapturePayload) {
  return apiRequest<{ pod: { id: string; status: string; created_at: string } }>(
    `/api/v1/driver/loads/${encodeURIComponent(loadId)}/stops/${encodeURIComponent(stopId)}/pod`,
    { method: "POST", body }
  );
}
