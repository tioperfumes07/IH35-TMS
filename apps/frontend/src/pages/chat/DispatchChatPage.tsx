// CHAT-3 — office Dispatch Chat hub. Per-load driver↔office threads. Transport v1 = polling
// (react-query refetchInterval; avoids the known app-wide SSE MIME bug). §7 palette (navy/slate).
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  listChatThreads,
  getThreadMessages,
  postChatMessage,
  uploadChatAttachment,
  getChatAttachmentDownloadUrl,
  type ChatThread,
  type ChatMessage,
} from "../../api/chat";
import { userFacingApiError } from "../../lib/api-error-message";

const TZ = "America/Chicago";
const ATTACH_ACCEPT = "image/jpeg,image/png,image/heic,image/webp,application/pdf";

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function threadLabel(t: ChatThread): string {
  if (t.kind === "load") return t.load_ref_cache ? `Load ${t.load_ref_cache}` : "Load thread";
  if (t.kind === "driver_direct") return t.subject || "Driver message";
  return t.subject || "Broadcast";
}

function attachmentLabel(m: ChatMessage): string {
  if (m.attachment_doc_type) return m.attachment_doc_type.toUpperCase();
  if (m.msg_type === "document") return "PDF";
  return "Photo";
}

export function DispatchChatPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const threadsQuery = useQuery({
    queryKey: ["chat", "threads", companyId],
    queryFn: () => listChatThreads(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 15000,
  });
  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeThreadId],
    queryFn: () => getThreadMessages(activeThreadId, companyId),
    enabled: Boolean(activeThreadId && companyId),
    refetchInterval: 5000,
  });
  const messages: ChatMessage[] = messagesQuery.data?.messages ?? [];

  const sendMutation = useMutation({
    mutationFn: (args: { body: string; msgType?: "text" | "confirmation_request" }) =>
      postChatMessage(activeThreadId, companyId, args.body, { msg_type: args.msgType ?? "text" }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "threads", companyId] });
    },
  });

  const attachMutation = useMutation({
    mutationFn: (file: File) => uploadChatAttachment(companyId, activeThreadId, file, { body: draft.trim() || null }),
    onSuccess: () => {
      setDraft("");
      setAttachError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "threads", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "upload_failed";
      setAttachError(msg.startsWith("unsupported_mime") ? "Only JPEG, PNG, HEIC, WebP, or PDF (≤25 MB)." : "Attachment upload failed — retry.");
    },
  });

  const openAttachment = async (attachmentId: string) => {
    try {
      const result = await getChatAttachmentDownloadUrl(attachmentId, companyId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setAttachError("Could not open attachment — retry.");
    }
  };

  const composerBusy = sendMutation.isPending || attachMutation.isPending;
  const archived = activeThread?.status === "archived";

  return (
    <div className="flex h-full flex-col" data-testid="dispatch-chat-page">
      <PageHeader title="Dispatch Chat" subtitle="Per-load driver ↔ office communication" />
      {!companyId ? (
        <p className="p-4 text-sm text-slate-700" data-testid="dispatch-chat-need-company">
          Select an operating company to load entity-scoped chat threads.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          {threadsQuery.isError ? (
            <ListErrorBanner
              message={userFacingApiError(threadsQuery.error, "Failed to load chat threads")}
              onRetry={() => void threadsQuery.refetch()}
            />
          ) : null}
          <div className="flex min-h-0 flex-1 gap-4">
          {/* Thread list */}
          <aside className="flex w-72 flex-col overflow-y-auto rounded-sm border border-slate-200">
            {threadsQuery.isLoading ? (
              <p className="p-3 text-sm text-slate-500">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="p-3 text-sm text-slate-700" data-testid="dispatch-chat-threads-honest-empty">
                No chats for this company yet. Threads appear when you message a load&apos;s driver from dispatch (or a
                driver opens a direct thread). Empty is expected until the first thread is created.
              </p>
            ) : (
              threads.map((t) => {
                const active = t.id === activeThreadId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveThreadId(t.id)}
                    className={`border-b border-slate-100 px-3 py-2 text-left text-sm ${active ? "bg-slate-100 text-[#1f2a44]" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{threadLabel(t)}</span>
                      {t.has_unacknowledged_confirmation ? (
                        <span className="rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Unacknowledged
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">{fmtTime(t.updated_at)}{t.status === "archived" ? " · archived" : ""}</div>
                  </button>
                );
              })
            )}
          </aside>

          {/* Message pane */}
          <section className="flex min-w-0 flex-1 flex-col rounded-sm border border-slate-200">
            {!activeThread ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a thread</div>
            ) : (
              <>
                <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-[#1f2a44]">{threadLabel(activeThread)}</div>
                {archived ? (
                  <div className="bg-slate-50 px-4 py-1 text-xs text-slate-500">Archived — load closed, read-only</div>
                ) : null}
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.map((m) => {
                    const dollars = m.cash_advance_amount_cents != null ? `$${(m.cash_advance_amount_cents / 100).toFixed(2)}` : "";
                    return (
                      <div key={m.id} className="text-sm">
                        <span className="mr-2 text-xs text-slate-400">#{m.seq} · {fmtTime(m.server_ts)} · {m.sender_party_type}</span>
                        {m.status === "tombstoned" ? (
                          <span className="italic text-slate-400">message removed</span>
                        ) : m.msg_type === "cash_advance_card" ? (
                          <span className="rounded-sm bg-slate-100 px-2 py-0.5 font-semibold text-[#1f2a44]">Cash advance {dollars} · {m.cash_advance_status ?? "pending"}</span>
                        ) : m.msg_type === "confirmation_request" ? (
                          <span>
                            <span className="rounded-sm bg-slate-100 px-2 py-0.5 font-semibold text-[#1f2a44]">Confirmation</span>{" "}
                            <span className="text-slate-800">{m.body}</span>{" "}
                            {m.acked_at ? (
                              <span className="text-xs font-semibold text-slate-600">✓ acknowledged {fmtTime(m.acked_at)}</span>
                            ) : (
                              <span className="text-xs text-slate-400">awaiting ack</span>
                            )}
                          </span>
                        ) : m.msg_type === "photo" || m.msg_type === "document" ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {m.body ? <span className="text-slate-800">{m.body}</span> : null}
                            {m.attachment_id ? (
                              <button
                                type="button"
                                onClick={() => void openAttachment(m.attachment_id!)}
                                className="rounded-sm border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-[#1f2a44] hover:bg-slate-100"
                              >
                                Open {attachmentLabel(m)}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">{m.msg_type}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-800">{m.body}</span>
                        )}
                      </div>
                    );
                  })}
                  {messages.length === 0 ? <p className="text-sm text-slate-400">No messages yet.</p> : null}
                </div>
                <div className="flex gap-2 border-t border-slate-200 p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    placeholder="Message the driver…"
                    className="flex-1 resize-none rounded-sm border border-slate-300 px-2 py-1 text-sm focus:border-[#1f2a44] focus:outline-hidden"
                  />
                  <div className="flex flex-col gap-1 self-end">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ATTACH_ACCEPT}
                      className="hidden"
                      aria-label="Attach photo or BOL"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || archived || composerBusy) return;
                        setAttachError(null);
                        attachMutation.mutate(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={composerBusy || archived}
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#1f2a44] disabled:opacity-40"
                    >
                      {attachMutation.isPending ? "Uploading…" : "Attach"}
                    </button>
                    <button
                      type="button"
                      disabled={!draft.trim() || composerBusy || archived}
                      onClick={() => sendMutation.mutate({ body: draft.trim() })}
                      className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      disabled={!draft.trim() || composerBusy || archived}
                      onClick={() => sendMutation.mutate({ body: draft.trim(), msgType: "confirmation_request" })}
                      className="rounded-sm border border-[#1f2a44] px-3 py-1 text-xs font-semibold text-[#1f2a44] disabled:opacity-40"
                    >
                      Send confirmation
                    </button>
                  </div>
                </div>
                {sendMutation.isError ? <p className="px-3 pb-2 text-xs text-red-600">Failed to send — retry.</p> : null}
                {attachError ? <p className="px-3 pb-2 text-xs text-red-600">{attachError}</p> : null}
              </>
            )}
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
