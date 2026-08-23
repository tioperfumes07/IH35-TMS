import { apiRequest } from "./client";

export type PwaDriverMessage = {
  id: string;
  message: string;
  channel: string;
  created_at: string;
  read_at: string | null;
  delivery_status: string;
  sender_side: "office" | "driver";
  // DRV-F6179 — a shared driver's inbox can hold messages from more than one company (home +
  // any active canonical authorization). Needed so reply/mark-read can target the RIGHT company
  // instead of always defaulting to home (see messages.routes.ts's assertDriverActingCompany).
  operating_company_id: string;
};

export function listDriverPwaMessages() {
  return apiRequest<{ driver_id: string; messages: PwaDriverMessage[] }>("/api/v1/driver/messages");
}

export function replyDriverPwaMessage(message: string, operatingCompanyId?: string) {
  return apiRequest<{ message: PwaDriverMessage }>("/api/v1/driver/messages", {
    method: "POST",
    body: { message, operating_company_id: operatingCompanyId },
  });
}

export function markDriverPwaMessageRead(messageId: string, operatingCompanyId?: string) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ message: PwaDriverMessage }>(`/api/v1/driver/messages/${messageId}/read${query}`, {
    method: "PATCH",
  });
}
