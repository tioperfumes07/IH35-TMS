import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listDriverPwaMessages, markDriverPwaMessageRead, replyDriverPwaMessage } from "../api/messages";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";
import { formatDateTime } from "../lib/formatDateTime";

function formatWhen(iso: string) {
  return formatDateTime(iso);
}

export function MessagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [reply, setReply] = useState("");

  const query = useQuery({
    queryKey: ["pwa", "driver-messages"],
    queryFn: listDriverPwaMessages,
  });

  const markReadMutation = useMutation({
    // DRV-F6179 — pass the message's OWN company (msg.operating_company_id), not always home.
    // The inbox can hold messages from more than one company (home + any active canonical
    // authorization); marking a non-home-company message read against home 404'd before this fix.
    mutationFn: (msg: { id: string; operating_company_id: string }) =>
      markDriverPwaMessageRead(msg.id, msg.operating_company_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pwa", "driver-messages"] });
    },
  });

  const messages = query.data?.messages ?? [];
  // DRV-F6179 — the composer is a single global reply box with no per-thread UI, so it defaults
  // to the company of the most recent message in the list (the conversation the driver is
  // actually looking at) instead of always the driver's home company. Falls back to home
  // (omitted -> backend default) when the inbox is empty.
  const latestMessageCompanyId = messages.length > 0 ? messages[messages.length - 1].operating_company_id : undefined;

  const replyMutation = useMutation({
    mutationFn: () => replyDriverPwaMessage(reply.trim(), latestMessageCompanyId),
    onSuccess: async () => {
      setReply("");
      pushToast(t("messages.reply_sent"), "success");
      await queryClient.invalidateQueries({ queryKey: ["pwa", "driver-messages"] });
    },
    onError: () => pushToast(t("messages.reply_failed"), "error"),
  });

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <div className="flex items-center justify-between">
          <Link to="/profile" className="text-sm text-pwa-text-secondary hover:underline">
            {t("messages.back_to_profile")}
          </Link>
          <Link to="/chat" className="text-sm font-semibold text-pwa-text-primary hover:underline">
            {t("chat.title", "Chat")} →
          </Link>
        </div>
        <PwaCard title={t("messages.title")} subtitle={t("messages.subtitle")}>
          {query.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("messages.loading")}</p> : null}
          {!query.isLoading && messages.length === 0 ? (
            <p className="text-sm text-pwa-text-secondary">{t("messages.empty")}</p>
          ) : null}
          <div className="space-y-2" data-testid="pwa-messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded border border-pwa-border p-2 text-sm ${
                  msg.sender_side === "office" ? "bg-[#101522]" : "bg-[#0d111c]"
                } ${!msg.read_at && msg.sender_side === "office" ? "border-amber-400" : ""}`}
              >
                <p>{msg.message}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-pwa-text-secondary">
                  <span>{formatWhen(msg.created_at)}</span>
                  <span>{msg.channel}</span>
                  {!msg.read_at && msg.sender_side === "office" ? (
                    <button
                      type="button"
                      className="font-semibold text-amber-300 underline"
                      onClick={() => markReadMutation.mutate({ id: msg.id, operating_company_id: msg.operating_company_id })}
                    >
                      {t("messages.mark_read")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-pwa-text-secondary">{t("messages.reply_label")}</label>
            <textarea
              data-testid="pwa-message-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={3}
              className="w-full rounded-sm border border-pwa-border bg-[#0d111c] px-2 py-2 text-sm text-white"
              placeholder={t("messages.reply_placeholder")}
            />
            <PwaButton
              type="button"
              data-testid="pwa-message-send"
              disabled={!reply.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate()}
            >
              {t("messages.send_reply")}
            </PwaButton>
          </div>
        </PwaCard>
      </div>
    </div>
  );
}
