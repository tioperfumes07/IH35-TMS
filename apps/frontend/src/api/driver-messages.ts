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
  driver_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  body: string;
  message: string;
  urgency: string | null;
  delivery_status: string | null;
  delivery_ref: string | null;
  created_at: string;
  read_at: string | null;
};

export function getDriverCommunications(
  driverId: string,
  operatingCompanyId: string,
  params?: { channel?: string; limit?: number; offset?: number }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params?.channel) q.set("channel", params.channel);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  return apiRequest<{ entries: DriverCommEntry[]; total: number }>(
    `/api/v1/drivers/${driverId}/communications?${q}`
  );
}
