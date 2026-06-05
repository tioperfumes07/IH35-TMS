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
  dual_ack?: { dropoff_ack_at: string | null; pickup_ack_at: string | null } | null;
};

export function listMyPendingTransfers() {
  return apiRequest<{ rows: PendingEquipmentTransfer[] }>("/api/v1/driver-pwa/my-pending-transfers");
}

export function listMyOutboundTransfers() {
  return apiRequest<{ rows: PendingEquipmentTransfer[] }>("/api/v1/driver-pwa/my-outbound-transfers");
}

export function ackDropoffMyTransfer(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-pwa/transfers/${id}/ack-dropoff`, { method: "POST", body: {} });
}

export function ackPickupMyTransfer(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-pwa/transfers/${id}/ack-pickup`, { method: "POST", body: {} });
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
