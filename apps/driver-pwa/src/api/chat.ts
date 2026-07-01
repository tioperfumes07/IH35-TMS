// CHAT-4 — driver PWA dispatch-chat client. Mirrors the CHAT-2 driver routes
// (apps/backend/src/chat/chat.routes.ts). Transport v1 = polling (react-query refetchInterval).
import { apiRequest } from "./client";

export type DriverChatThread = {
  id: string;
  kind: "load" | "driver_direct" | "broadcast";
  load_id: string | null;
  load_ref_cache: string | null;
  subject: string | null;
  status: "open" | "archived";
  last_seq: number;
  updated_at: string;
};

export type DriverChatMessage = {
  id: string;
  thread_id: string;
  seq: number;
  sender_party_type: "office" | "driver" | "system";
  msg_type: "text" | "photo" | "document" | "confirmation_request" | "confirmation_ack" | "cash_advance_card" | "system_event";
  body: string | null;
  status: "active" | "tombstoned";
  server_ts: string;
};

export function newClientKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export async function contentSha256(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function listDriverChatThreads() {
  return apiRequest<{ driver_id: string; threads: DriverChatThread[] }>("/api/v1/driver/chat/threads");
}

export function getDriverThreadMessages(threadId: string, after_seq = 0) {
  return apiRequest<{ messages: DriverChatMessage[] }>(`/api/v1/driver/chat/threads/${threadId}/messages?after_seq=${after_seq}`);
}

export async function postDriverChatMessage(threadId: string, body: string, client_key?: string) {
  return apiRequest<{ message: DriverChatMessage; deduped: boolean }>(`/api/v1/driver/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: { client_key: client_key ?? newClientKey(), content_sha256: await contentSha256(body), msg_type: "text", body },
  });
}
