// CHAT-3 — office dispatch-chat API client. Mirrors the CHAT-2 backend
// (apps/backend/src/chat/chat.routes.ts). Transport v1 = polling (react-query refetchInterval).
import { apiRequest } from "./client";
import { uploadFileToR2 } from "./docs";

export type ChatThread = {
  id: string;
  kind: "load" | "driver_direct" | "broadcast";
  load_id: string | null;
  load_ref_cache: string | null;
  subject: string | null;
  status: "open" | "archived";
  last_seq: number;
  updated_at: string;
  // NOTIF-A read-only derivations (server-computed in listThreads):
  has_pending_confirmation?: boolean; // any unacked confirmation_request on this thread
  has_unacknowledged_confirmation?: boolean; // unacked past the escalation window → UNACKNOWLEDGED badge
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
  // Attachment enrichment (upload-then-commit):
  attachment_id?: string | null;
  attachment_r2_key?: string | null;
  attachment_sha256?: string | null;
  attachment_mime_type?: string | null;
  attachment_size_bytes?: number | null;
  attachment_doc_type?: "bol" | "pod" | "receipt" | "lumper" | "other" | null;
  attachment_upload_completed_at?: string | null;
};

const CHAT_ATTACHMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);

export function newClientKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ck-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** sha256 hex of the message content — feeds the tamper-evident event-log chain server-side. */
export async function contentSha256(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
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

export function presignChatAttachment(
  operating_company_id: string,
  thread_id: string,
  sha256: string,
  mime_type: string,
) {
  return apiRequest<{ r2_key: string; url: string; expires_in_seconds: number; bucket: string }>(
    "/api/v1/chat/attachments/presign",
    {
      method: "POST",
      body: { operating_company_id, thread_id, sha256, mime_type },
    },
  );
}

export function commitChatAttachment(
  operating_company_id: string,
  args: {
    thread_id: string;
    client_key: string;
    content_sha256: string;
    r2_key: string;
    sha256: string;
    mime_type: string;
    size_bytes: number;
    body?: string | null;
    doc_type?: "bol" | "pod" | "receipt" | "lumper" | "other" | null;
  },
) {
  return apiRequest<{ message: ChatMessage; attachment: { id: string }; deduped: boolean }>(
    "/api/v1/chat/attachments/commit",
    {
      method: "POST",
      body: { operating_company_id, ...args },
    },
  );
}

export function getChatAttachmentDownloadUrl(attachmentId: string, operating_company_id: string) {
  return apiRequest<{
    attachment_id: string;
    mime_type: string;
    sha256: string;
    url: string;
    expires_in_seconds: number;
  }>(
    `/api/v1/chat/attachments/${attachmentId}/download-url?operating_company_id=${encodeURIComponent(operating_company_id)}`,
  );
}

/**
 * Upload-then-commit a chat attachment: sha256 → chat presign → R2 PUT (docs helper) → commit.
 * Reuses the existing R2 PUT path; no new storage stack.
 */
export async function uploadChatAttachment(
  operating_company_id: string,
  thread_id: string,
  file: File,
  opts: { body?: string | null; doc_type?: "bol" | "pod" | "receipt" | "lumper" | "other" | null } = {},
) {
  const mime = (file.type || "").toLowerCase();
  if (!CHAT_ATTACHMENT_MIME.has(mime)) {
    throw new Error(`unsupported_mime_type:${mime || "unknown"}`);
  }
  if (file.size <= 0 || file.size > 26_214_400) {
    throw new Error("invalid_size_bytes");
  }
  const sha256 = await fileSha256(file);
  const clientKey = newClientKey();
  const caption = opts.body?.trim() || file.name || (mime === "application/pdf" ? "Document" : "Photo");
  const contentHash = await contentSha256(caption);
  const presigned = await presignChatAttachment(operating_company_id, thread_id, sha256, mime);
  await uploadFileToR2(presigned.url, file, mime);
  return commitChatAttachment(operating_company_id, {
    thread_id,
    client_key: clientKey,
    content_sha256: contentHash,
    r2_key: presigned.r2_key,
    sha256,
    mime_type: mime,
    size_bytes: file.size,
    body: caption,
    doc_type: opts.doc_type ?? "other",
  });
}
