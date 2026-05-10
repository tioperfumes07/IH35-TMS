import { apiRequest } from "./client";

export type PendingEquipmentTransfer = {
  id: string;
  equipment_id: string;
  from_driver_id: string;
  to_driver_id: string;
  transfer_location: string | null;
  notes: string | null;
  status: string;
  expires_at: string;
};

export function listMyPendingTransfers() {
  return apiRequest<{ rows: PendingEquipmentTransfer[] }>("/api/v1/driver-pwa/my-pending-transfers");
}

export function confirmMyTransfer(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-pwa/transfers/${id}/confirm`, {
    method: "POST",
    body: {},
  });
}

export function rejectMyTransfer(id: string, rejection_reason: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-pwa/transfers/${id}/reject`, {
    method: "POST",
    body: { rejection_reason },
  });
}
