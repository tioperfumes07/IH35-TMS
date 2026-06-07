import { apiRequest } from "./client";

export type DriverInboxMessage = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  message: string;
  channel: "sms" | "email" | "in_app";
  urgency: string | null;
  created_by: string | null;
  created_at: string;
  read_at: string | null;
  read_by: string | null;
  delivery_status: string;
  delivery_ref: string | null;
  sender_side: "office" | "driver";
  driver_name?: string;
};

export type DriverInboxConversation = {
  driver_id: string;
  driver_name: string;
  latest_message: string;
  latest_at: string;
  unread_count: number;
  latest_channel: string;
};

export function getDriverMessagesInbox(operatingCompanyId: string) {
  return apiRequest<{ conversations: DriverInboxConversation[] }>(
    `/api/v1/drivers/messages/inbox?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDriverMessagesUnread(operatingCompanyId: string) {
  return apiRequest<{ messages: DriverInboxMessage[]; unread_count: number }>(
    `/api/v1/drivers/messages/unread?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDriverMessageThread(driverId: string, operatingCompanyId: string) {
  return apiRequest<{ driver_id: string; messages: DriverInboxMessage[] }>(
    `/api/v1/drivers/messages/${driverId}/thread?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function markDriverMessageRead(messageId: string, operatingCompanyId: string) {
  return apiRequest<{ message: DriverInboxMessage }>(
    `/api/v1/drivers/messages/${messageId}/read?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH" }
  );
}

export type DriverCommEntry = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  message: string;
  channel: "sms" | "email" | "in_app";
  direction: "inbound" | "outbound";
  urgency: string | null;
  created_by: string | null;
  created_at: string;
  delivery_status: string;
  delivery_ref: string | null;
};

export function getDriverCommunications(
  driverId: string,
  operatingCompanyId: string,
  opts?: { channel?: string; limit?: number; offset?: number }
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (opts?.channel) params.set("channel", opts.channel);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  return apiRequest<{
    driver_id: string;
    entries: DriverCommEntry[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/drivers/${driverId}/communications?${params.toString()}`);
}
