import { apiRequest } from "./client";

export type OwnerApprovalPortalPayload = {
  request: Record<string, unknown>;
  driver_history: {
    advances: Record<string, unknown>[];
    settlements: Record<string, unknown>[];
  };
  policy: {
    threshold_dollars: number;
    requested_amount_dollars: number;
    is_above_policy: boolean;
    headroom_dollars: number;
    policy_overage_dollars: number;
  };
  recommendation: "low" | "medium" | "high";
};

export function getOwnerApprovalPortalDetails(token: string) {
  return apiRequest<OwnerApprovalPortalPayload>(`/api/v1/owner-approval/${encodeURIComponent(token)}`);
}

export function ownerApprovalApprove(token: string, body: { owner_notes: string }) {
  return apiRequest<{ request: Record<string, unknown>; advance: Record<string, unknown> }>(
    `/api/v1/owner-approval/${encodeURIComponent(token)}/approve`,
    { method: "POST", body }
  );
}

export function ownerApprovalDeny(token: string, body: { owner_notes: string }) {
  return apiRequest<{ request: Record<string, unknown> }>(
    `/api/v1/owner-approval/${encodeURIComponent(token)}/deny`,
    { method: "POST", body }
  );
}
