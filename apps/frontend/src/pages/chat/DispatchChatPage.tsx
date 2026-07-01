// CHAT-3 — office Dispatch Chat hub. Per-load driver↔office threads. Transport v1 = polling
// (react-query refetchInterval; avoids the known app-wide SSE MIME bug). §7 palette (navy/slate).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listChatThreads, getThreadMessages, postChatMessage, type ChatThread, type ChatMessage } from "../../api/chat";

const TZ = "America/Chicago";
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

export function DispatchChatPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [draft, setDraft] = useState("");

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
    mutationFn: (body: string) => postChatMessage(activeThreadId, companyId, body),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "threads", companyId] });
    },
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Dispatch Chat" subtitle="Per-load driver ↔ office communication" />
      {!companyId ? (
        <p className="p-4 text-sm text-slate-500">Select a company to view chats.</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          {/* Thread list */}
          <aside className="flex w-72 flex-col overflow-y-auto rounded border border-slate-200">
            {threadsQuery.isLoading ? (
              <p className="p-3 text-sm text-slate-500">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No chats yet. A thread is created when you message a load's driver.</p>
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
                    <div className="font-semibold">{threadLabel(t)}</div>
                    <div className="text-xs text-slate-500">{fmtTime(t.updated_at)}{t.status === "archived" ? " · archived" : ""}</div>
                  </button>
                );
              })
            )}
          </aside>

          {/* Message pane */}
          <section className="flex min-w-0 flex-1 flex-col rounded border border-slate-200">
            {!activeThread ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a thread</div>
            ) : (
              <>
                <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-[#1f2a44]">{threadLabel(activeThread)}</div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.map((m) => (
                    <div key={m.id} className="text-sm">
                      <span className="mr-2 text-xs text-slate-400">#{m.seq} · {fmtTime(m.server_ts)} · {m.sender_party_type}</span>
                      {m.status === "tombstoned" ? (
                        <span className="italic text-slate-400">message removed</span>
                      ) : (
                        <span className="text-slate-800">{m.body}</span>
                      )}
                    </div>
                  ))}
                  {messages.length === 0 ? <p className="text-sm text-slate-400">No messages yet.</p> : null}
                </div>
                <div className="flex gap-2 border-t border-slate-200 p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    placeholder="Message the driver…"
                    className="flex-1 resize-none rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#1f2a44] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!draft.trim() || sendMutation.isPending}
                    onClick={() => sendMutation.mutate(draft.trim())}
                    className="self-end rounded bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
                {sendMutation.isError ? <p className="px-3 pb-2 text-xs text-red-600">Failed to send — retry.</p> : null}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
