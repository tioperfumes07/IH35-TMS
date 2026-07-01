// CHAT-4 — driver PWA per-load dispatch chat. Lists the driver's load threads, opens a thread
// (messages + composer). Transport v1 = polling. ES/EN chrome via i18n. Dark PWA theme.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";
import { listDriverChatThreads, getDriverThreadMessages, postDriverChatMessage, ackConfirmation, type DriverChatThread, type DriverChatMessage } from "../api/chat";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function ChatPage() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [draft, setDraft] = useState("");

  const threadsQuery = useQuery({
    queryKey: ["pwa", "chat-threads"],
    queryFn: listDriverChatThreads,
    refetchInterval: 15000,
  });
  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);

  const messagesQuery = useQuery({
    queryKey: ["pwa", "chat-messages", activeThreadId],
    queryFn: () => getDriverThreadMessages(activeThreadId),
    enabled: Boolean(activeThreadId),
    refetchInterval: 5000,
  });
  const messages = messagesQuery.data?.messages ?? [];

  const sendMutation = useMutation({
    mutationFn: (body: string) => postDriverChatMessage(activeThreadId, body),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["pwa", "chat-messages", activeThreadId] });
      await queryClient.invalidateQueries({ queryKey: ["pwa", "chat-threads"] });
    },
    onError: () => pushToast(t("chat.send_failed", "Failed to send — retry."), "error"),
  });

  const ackMutation = useMutation({
    mutationFn: (m: DriverChatMessage) => ackConfirmation(activeThreadId, m.id, m.body ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pwa", "chat-messages", activeThreadId] });
    },
    onError: () => pushToast(t("chat.ack_failed", "Could not acknowledge — retry."), "error"),
  });

  function threadLabel(th: DriverChatThread) {
    if (th.kind === "load") return th.load_ref_cache ? `${t("chat.load", "Load")} ${th.load_ref_cache}` : t("chat.load_thread", "Load chat");
    return th.subject || t("chat.message", "Message");
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <Link to="/today" className="text-sm text-pwa-text-secondary hover:underline">{t("chat.back", "Back")}</Link>

        {!activeThreadId ? (
          <PwaCard title={t("chat.title", "Chat")} subtitle={t("chat.subtitle", "Messages with dispatch")}>
            {threadsQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("chat.loading", "Loading…")}</p> : null}
            {!threadsQuery.isLoading && threads.length === 0 ? (
              <p className="text-sm text-pwa-text-secondary">{t("chat.empty", "No chats yet.")}</p>
            ) : null}
            <div className="space-y-2">
              {threads.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setActiveThreadId(th.id)}
                  className="w-full rounded border border-pwa-border px-3 py-2 text-left"
                >
                  <div className="text-sm font-semibold">{threadLabel(th)}</div>
                  <div className="text-xs text-pwa-text-secondary">{formatWhen(th.updated_at)}</div>
                </button>
              ))}
            </div>
          </PwaCard>
        ) : (
          <PwaCard title={threadLabel(threads.find((x) => x.id === activeThreadId) ?? ({ kind: "load" } as DriverChatThread))}>
            <button type="button" onClick={() => setActiveThreadId("")} className="mb-2 text-xs text-pwa-text-secondary hover:underline">
              ← {t("chat.all_chats", "All chats")}
            </button>
            <div className="mb-3 max-h-[50vh] space-y-2 overflow-y-auto" data-testid="pwa-chat-messages">
              {messages.map((m) => {
                const dollars = m.cash_advance_amount_cents != null ? `$${(m.cash_advance_amount_cents / 100).toFixed(2)}` : "";
                return (
                  <div key={m.id} className="text-sm">
                    <span className="mr-2 text-xs text-pwa-text-secondary">#{m.seq} · {formatWhen(m.server_ts)} · {m.sender_party_type}</span>
                    {m.status === "tombstoned" ? (
                      <span className="italic text-pwa-text-secondary">{t("chat.removed", "message removed")}</span>
                    ) : m.msg_type === "cash_advance_card" ? (
                      <span className="font-semibold">{t("chat.cash_advance", "Cash advance")} {dollars} · {m.cash_advance_status ?? "pending"}</span>
                    ) : m.msg_type === "confirmation_request" ? (
                      <span>
                        <span className="font-semibold">{t("chat.confirmation", "Confirmation")}:</span> {m.body}{" "}
                        {m.acked_at ? (
                          <span className="text-xs text-pwa-text-secondary">✓ {t("chat.acknowledged", "acknowledged")}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={ackMutation.isPending}
                            onClick={() => ackMutation.mutate(m)}
                            className="ml-1 rounded border border-pwa-border px-2 py-0.5 text-xs font-semibold disabled:opacity-40"
                          >
                            {t("chat.acknowledge", "Acknowledge")}
                          </button>
                        )}
                      </span>
                    ) : (
                      <span>{m.body}</span>
                    )}
                  </div>
                );
              })}
              {messages.length === 0 ? <p className="text-sm text-pwa-text-secondary">{t("chat.no_messages", "No messages yet.")}</p> : null}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={t("chat.placeholder", "Message dispatch…")}
              className="mb-2 w-full resize-none rounded border border-pwa-border bg-pwa-bg px-2 py-1 text-sm"
            />
            <PwaButton disabled={!draft.trim() || sendMutation.isPending} onClick={() => sendMutation.mutate(draft.trim())}>
              {t("chat.send", "Send")}
            </PwaButton>
            <Link to="/cash-advance/new" className="mt-2 block text-center text-xs font-semibold text-pwa-text-secondary hover:underline">
              {t("chat.request_advance", "Request cash advance")}
            </Link>
          </PwaCard>
        )}
      </div>
    </div>
  );
}
