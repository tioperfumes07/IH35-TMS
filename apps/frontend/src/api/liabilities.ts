import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getLiabilitiesKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/liabilities/dashboard/kpis?${q(companyId)}`);
}

export function getActiveLiabilities(companyId: string) {
  return apiRequest<{ liabilities: Array<Record<string, unknown>> }>(`/api/v1/liabilities/active?${q(companyId)}`);
}

export function getLiabilityDetail(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/liabilities/${id}?${q(companyId)}`);
}

export function getLiabilitiesByDriver(driverId: string, companyId: string) {
  return apiRequest<{ liabilities: Array<Record<string, unknown>> }>(
    `/api/v1/liabilities/by-driver/${driverId}?${q(companyId)}`
  );
}

export function sendLiabilityAckRequest(id: string, companyId: string, payload: { channel: "whatsapp" | "sms" | "email"; message: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/liabilities/${id}/send-ack-request?${q(companyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function holdLiability(id: string, companyId: string, reason: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/liabilities/${id}/hold?${q(companyId)}`, {
    method: "PATCH",
    body: { reason },
  });
}

export function resumeLiability(id: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/liabilities/${id}/resume?${q(companyId)}`, {
    method: "PATCH",
  });
}

export function markLiabilityPaidOff(id: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/liabilities/${id}/mark-paid-off?${q(companyId)}`, {
    method: "PATCH",
  });
}
