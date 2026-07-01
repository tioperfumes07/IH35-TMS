// CHAT-3 — office dispatch-chat API client. Mirrors the CHAT-2 backend
// (apps/backend/src/chat/chat.routes.ts). Transport v1 = polling (react-query refetchInterval).
import { apiRequest } from "./client";

export type ChatThread = {
  id: string;
  kind: "load" | "driver_direct" | "broadcast";
  load_id: string | null;
  load_ref_cache: string | null;
  subject: string | null;
  status: "open" | "archived";
  last_seq: number;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  seq: number;
  sender_party_type: "office" | "driver" | "system";
  sender_office_user_id: string | null;
  sender_driver_id: string | null;
  msg_type: "text" | "photo" | "document" | "confirmation_request" | "confirmation_ack" | "cash_advance_card" | "system_event";
  body: string | null;
  status: "active" | "tombstoned";
  server_ts: string;
  // CHAT-5 read-only enrichment:
  cash_advance_status?: string | null;
  cash_advance_amount_cents?: number | null;
  ack_message_id?: string | null;
  acked_at?: string | null;
};

export function newClientKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** sha256 hex of the message content — feeds the tamper-evident event-log chain server-side. */
export async function contentSha256(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getOrCreateLoadThread(operating_company_id: string, load_id: string) {
  return apiRequest<{ thread: { id: string; created: boolean } }>("/api/v1/chat/threads/for-load", {
    method: "POST",
    body: { operating_company_id, load_id },
  });
}

export function listChatThreads(operating_company_id: string) {
  return apiRequest<{ threads: ChatThread[] }>(`/api/v1/chat/threads?operating_company_id=${encodeURIComponent(operating_company_id)}`);
}

export function getThreadMessages(threadId: string, operating_company_id: string, after_seq = 0) {
  return apiRequest<{ messages: ChatMessage[] }>(
    `/api/v1/chat/threads/${threadId}/messages?operating_company_id=${encodeURIComponent(operating_company_id)}&after_seq=${after_seq}`,
  );
}

export async function postChatMessage(
  threadId: string,
  operating_company_id: string,
  body: string,
  opts: {
    client_key?: string;
    msg_type?: ChatMessage["msg_type"];
    references_message_id?: string;
    ack_content_sha256?: string;
    cash_advance_request_id?: string;
  } = {},
) {
  return apiRequest<{ message: ChatMessage; deduped: boolean }>(`/api/v1/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: {
      operating_company_id,
      client_key: opts.client_key ?? newClientKey(),
      content_sha256: await contentSha256(body),
      msg_type: opts.msg_type ?? "text",
      body,
      references_message_id: opts.references_message_id,
      ack_content_sha256: opts.ack_content_sha256,
      cash_advance_request_id: opts.cash_advance_request_id,
    },
  });
}

export function advanceChatReceipt(messageId: string, operating_company_id: string, participant_id: string, state: "delivered" | "read") {
  return apiRequest<{ ok: true }>(`/api/v1/chat/messages/${messageId}/receipt`, {
    method: "POST",
    body: { operating_company_id, participant_id, state },
  });
}
