import { apiRequest } from "./client";

export type PwaDriverMessage = {
  id: string;
  message: string;
  channel: string;
  created_at: string;
  read_at: string | null;
  delivery_status: string;
  sender_side: "office" | "driver";
};

export function listDriverPwaMessages() {
  return apiRequest<{ driver_id: string; messages: PwaDriverMessage[] }>("/api/v1/driver/messages");
}

export function replyDriverPwaMessage(message: string) {
  return apiRequest<{ message: PwaDriverMessage }>("/api/v1/driver/messages", {
    method: "POST",
    body: { message },
  });
}

export function markDriverPwaMessageRead(messageId: string) {
  return apiRequest<{ message: PwaDriverMessage }>(`/api/v1/driver/messages/${messageId}/read`, {
    method: "PATCH",
  });
}
